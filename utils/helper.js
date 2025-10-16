const { EmbedBuilder, MessageFlags } = require('discord.js');
const { 
  getEvent, 
  setReminder, 
  addAttendee, 
  removeAttendee,
  cancelReminder,
  deleteEvent,
  createEvent,
  addInvited
} = require('./eventManager');
const { trackRSVP, trackMaybe, trackFastRSVP, trackWorthyEvent } = require('./achievementManager');
const chrono = require('chrono-node');

/**
 * Validates if a string contains a legitimate date/time format.
 */
function isValidDateTime(str) {
  if (!str || str.length < 4) return false;

  const lower = str.toLowerCase();
  const daysOfWeek = ['monday','mon','tuesday','tue','tues','wednesday','wed','thursday','thu','thurs','friday','fri','saturday','sat','sunday','sun'];
  const months = ['january','jan','february','feb','march','mar','april','apr','may','june','jun','july','jul','august','aug','september','sept','sep','october','oct','november','nov','december','dec'];

  const hasDayOfWeek = daysOfWeek.some(day => lower.includes(day));
  const hasMonth = months.some(month => lower.includes(month));
  const hasDatePattern = /\d{1,2}[\/\-]\d{1,2}/.test(str);
  const hasTimePattern = /\d{1,2}(:\d{2})?\s*(am|pm)|\d{1,2}:\d{2}/i.test(str);
  const hasRelativeDay = /\b(today|tomorrow|tonight|tmr|tmrw)\b/i.test(lower);

  const hasDateIndicator = hasDayOfWeek || hasMonth || hasDatePattern || hasRelativeDay;
  return hasDateIndicator && hasTimePattern;
}

/**
 * Validates and adjusts event time. 
 * - If user explicitly says "today"/"tonight" and time is past → reject
 * - If time is in the past (other days) → automatically adds 7 days
 * Returns { eventTime, debugInfo } or { eventTime: null, debugInfo } if invalid.
 */
function validateAndAdjustEventTime(timeString) {
  const now = new Date();
  const debugInfo = {
    input: timeString,
    currentTime: now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'full', timeStyle: 'short' })
  };
  
  const parsed = chrono.parse(timeString, new Date(), { timezone: 'PST' });
  if (!parsed || parsed.length === 0) {
    debugInfo.error = 'Failed to parse time';
    return { eventTime: null, debugInfo };
  }
  
  let eventTime = parsed[0].start.date();
  debugInfo.parsedTime = eventTime.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'full', timeStyle: 'short' });
  debugInfo.isInPast = eventTime <= now;
  
  // Check if user explicitly said "today" or "tonight"
  const lowerInput = timeString.toLowerCase();
  const explicitToday = lowerInput.includes('today') || lowerInput.includes('tonight');
  debugInfo.explicitToday = explicitToday;
  
  // Validate that parsed day matches input (chrono sometimes fails on abbreviations like "tues")
  const dayNames = {
    'sunday': 0, 'sun': 0,
    'monday': 1, 'mon': 1,
    'tuesday': 2, 'tue': 2, 'tues': 2,
    'wednesday': 3, 'wed': 3,
    'thursday': 4, 'thu': 4, 'thurs': 4,
    'friday': 5, 'fri': 5,
    'saturday': 6, 'sat': 6
  };
  
  // Check if user specified a day name
  const inputDay = Object.keys(dayNames).find(day => lowerInput.includes(day));
  if (inputDay && !explicitToday) {
    const expectedDayNum = dayNames[inputDay];
    const parsedDayNum = eventTime.getDay();
    
    debugInfo.inputDayName = inputDay;
    debugInfo.expectedDayNum = expectedDayNum;
    debugInfo.parsedDayNum = parsedDayNum;
    
    // If parsed day doesn't match input day, manually set it
    if (parsedDayNum !== expectedDayNum) {
      debugInfo.dayMismatch = true;
      
      // Calculate days until the target day
      let daysUntil = expectedDayNum - parsedDayNum;
      if (daysUntil <= 0) daysUntil += 7; // Go to next week if day already passed
      
      eventTime = new Date(eventTime.getTime() + daysUntil * 24 * 60 * 60 * 1000);
      debugInfo.correctedTime = eventTime.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'full', timeStyle: 'short' });
      debugInfo.parsedTime = debugInfo.correctedTime; // Update parsedTime to show corrected time
    }
  }
  
  // Re-check if time is in the past after correction
  debugInfo.isInPast = eventTime <= now;
  
  // Check if event is too far in the future (max 24 days due to setTimeout limitation)
  const MAX_DAYS_AHEAD = 24;
  const maxFutureTime = new Date(now.getTime() + (MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000));
  const daysAhead = Math.ceil((eventTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (eventTime > maxFutureTime) {
    debugInfo.isTooFarInFuture = true;
    debugInfo.daysAhead = daysAhead;
    debugInfo.maxDaysAllowed = MAX_DAYS_AHEAD;
    debugInfo.error = `Event is too far in the future (${daysAhead} days ahead, max is ${MAX_DAYS_AHEAD} days)`;
    return { eventTime: null, debugInfo };
  }
  
  debugInfo.isTooFarInFuture = false;
  debugInfo.daysAhead = daysAhead;
  
  // If parsed time is in the past
  if (eventTime <= now) {
    // Check if it's today
    const eventDate = new Date(eventTime);
    const nowDate = new Date(now);
    const isSameDay = eventDate.getFullYear() === nowDate.getFullYear() &&
                      eventDate.getMonth() === nowDate.getMonth() &&
                      eventDate.getDate() === nowDate.getDate();
    
    debugInfo.isSameDay = isSameDay;
    
    // If user explicitly said "today" or "tonight" and time is past, reject it
    if (explicitToday && eventTime <= now) {
      debugInfo.action = 'Rejected: User said "today" but time has passed';
      return { eventTime: null, debugInfo };
    }
    
    // Otherwise, add 7 days (user said a day name, not "today")
    eventTime = new Date(eventTime.getTime() + 7 * 24 * 60 * 60 * 1000);
    debugInfo.action = isSameDay ? 'Added 7 days (same day, past time → next week)' : 'Added 7 days (past day → next week)';
    debugInfo.adjustedTime = eventTime.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'full', timeStyle: 'short' });
    
    // If still in the past after adding a week, return null
    if (eventTime <= now) {
      debugInfo.error = 'Still in past after adding 7 days';
      return { eventTime: null, debugInfo };
    }
  } else {
    debugInfo.action = 'No adjustment needed (future time)';
  }
  
  return { eventTime, debugInfo };
}

/**
 * Schedules a reminder 45 minutes before the event time.
 * Uses PST timezone for parsing.
 */
function scheduleReminder(eventId, timeString, channel, rolePing, creator) {
  // Parse the time string with PST timezone context
  const parsed = chrono.parse(timeString, new Date(), { timezone: 'PST' });
  
  if (!parsed || parsed.length === 0) {
    return false;
  }
  
  const eventTime = parsed[0].start.date();
  const reminderTime = new Date(eventTime.getTime() - 45 * 60 * 1000); // 45 minutes before
  const now = new Date();
  
  // Only schedule if reminder time is in the future
  if (reminderTime <= now) {
    return false;
  }
  
  const delayMs = reminderTime.getTime() - now.getTime();
  
  // Safety check: JavaScript setTimeout has a max delay of ~24.8 days (2^31 - 1 milliseconds)
  // This should never trigger since we prevent events >24 days, but kept as a safety net
  const MAX_TIMEOUT_MS = 2147483647; // Max 32-bit signed integer
  
  if (delayMs > MAX_TIMEOUT_MS) {
    return false;
  }
  
  // Randomized reminder messages
  const reminderMessages = [
    { title: '⚡ Get on soon!', desc: 'Game night starts in **45 minutes!**' },
    { title: '🎮 Start updating!', desc: 'Make sure your game is up to date!' },
    { title: '🦸 Get ready to play!', desc: 'Suit up! Game time in **45 minutes!**' },
    { title: '🔥 Almost time!', desc: 'Game night kicks off in **45 minutes!**' },
    { title: '💥 Heads up!', desc: "We're playing in **45 minutes!**" },
    { title: '🎯 Game time approaching!', desc: 'Lock in! Game starts soon!' },
    { title: '⚔️ Assemble soon!', desc: 'Heroes needed in **45 minutes!**' }
  ];
  
  // Schedule the reminder
  const timeoutId = setTimeout(async () => {
    const event = getEvent(eventId);
    if (!event) return;
    
    const attendeeMentions = event.attendees.map(id => `<@${id}>`).join(' ');
    const randomMsg = reminderMessages[Math.floor(Math.random() * reminderMessages.length)];
    
    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle(randomMsg.title)
      .setDescription(randomMsg.desc)
      .setImage('https://giffiles.alphacoders.com/223/223284.gif')
      .addFields(
        { name: 'Event ID', value: `#${eventId}` }
      );
    
    await channel.send({
      content: attendeeMentions ? `⏰ ${attendeeMentions}` : `⏰ ${rolePing}`,
      embeds: [embed],
      allowedMentions: { parse: ['users', 'roles'] }
    });
  }, delayMs);
  
  setReminder(eventId, timeoutId, channel.id, null);
  return true;
}

/**
 * Sets up RSVP reaction collectors and handles automatic reschedule prompts.
 * For planned events: ✅ Available | 🤔 Maybe | ❌ Can't make it | 🔁 Reschedule
 * For play now events: ✅ | ❌
 */
function setupRSVPCollector(msg, interaction, rolePing, id, role, eventType, time) {
  const isPlanned = eventType === 'planned';
  const rsvpEmojis = isPlanned ? ['✅', '🤔', '❌', '🔁'] : ['✅', '❌'];
  const counts = Object.fromEntries(rsvpEmojis.map(e => [e, 0]));

  const filter = (reaction, user) => rsvpEmojis.includes(reaction.emoji.name) && !user.bot;
  const collector = msg.createReactionCollector({ filter, dispose: true });

  let reschedulePrompted = false;

  const shouldPromptReschedule = () => {
    if (!isPlanned) return false;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total < 5) return false;
    const available = counts['✅'] / total;
    const conflict = (counts['❌'] + counts['🤔']) / total;
    const suggestNew = counts['🔁'] / total;
    return available < 0.4 || conflict > 0.5 || suggestNew >= 0.25;
  };

  collector.on('collect', (reaction, user) => {
    counts[reaction.emoji.name]++;
    
    const event = getEvent(id);
    const achievements = [];
    
    if (reaction.emoji.name === '✅') {
      addAttendee(id, user.id);
      
      // Track RSVP achievement (only for Available)
      const rsvpAchievements = trackRSVP(user.id);
      achievements.push(...rsvpAchievements);
      
      // Check for fast RSVP (within 30 seconds, not your own event)
      if (event && user.id !== event.creatorId) {
        const timeSinceCreation = (Date.now() - event.createdAt) / 1000; // seconds
        if (timeSinceCreation <= 30) {
          const bullseyeAchievements = trackFastRSVP(user.id);
          achievements.push(...bullseyeAchievements);
        }
      }
      
      // Check for Worthy achievement (5+ RSVPs on host's event)
      if (event && event.attendees.length >= 5) {
        const worthyAchievements = trackWorthyEvent(event.creatorId);
        if (worthyAchievements.length > 0) {
          const worthyText = worthyAchievements.map(a => `<@${event.creatorId}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
          msg.channel.send(worthyText).catch(() => {});
        }
      }
    }
    else if (reaction.emoji.name === '❌') {
      removeAttendee(id, user.id);
    }
    else if (reaction.emoji.name === '🤔') {
      // Track Maybe responses
      const maybeAchievements = trackMaybe(user.id);
      achievements.push(...maybeAchievements);
    }
    
    // Send achievement notifications
    if (achievements.length > 0) {
      const achievementText = achievements.map(a => `${user} unlocked ${a.emoji} **${a.name}**!`).join('\n');
      msg.channel.send(achievementText).catch(() => {});
    }

    // Remove conflicting RSVPs
    msg.reactions.cache.forEach(r => {
      if (r.emoji.name !== reaction.emoji.name && rsvpEmojis.includes(r.emoji.name)) {
        r.users.remove(user.id).catch(() => {});
      }
    });

    // Handle rescheduling prompt
    if (isPlanned && !reschedulePrompted && shouldPromptReschedule()) {
      reschedulePrompted = true;
      interaction.channel.send(
        `🕓 Not everyone can make it!\n<@${interaction.user.id}>, should we reschedule?\nReply with a date + time.`
      );

      const msgCollector = interaction.channel.createMessageCollector({
        filter: m => m.author.id === interaction.user.id,
        time: 60000,
      });

      msgCollector.on('collect', async m => {
        const input = m.content.trim().toLowerCase();

        // Handle cancellation
        if (input === 'no' || input === 'n') {
          await m.delete().catch(() => {});
          msgCollector.stop('cancel');
          await interaction.followUp({
            content: '🛑 Reschedule cancelled.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        // Validate and adjust time
        if (!isValidDateTime(input)) {
          await interaction.followUp({
            content: `❌ "${m.content.trim()}" is not valid. Try "Oct 18 5PM", or type "no" to cancel.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        
        const result = validateAndAdjustEventTime(input);
        
        if (!result.eventTime) {
          let errorMsg;
          
          if (result.debugInfo.isTooFarInFuture) {
            errorMsg = `❌ That's too far in the future! Events can only be scheduled up to 24 days ahead.`;
          } else if (result.debugInfo.explicitToday) {
            errorMsg = `❌ That time has already passed today! Try again or type "no" to cancel. (All times are PST)`;
          } else {
            errorMsg = `❌ Unable to schedule for that time. Try a different time or type "no" to cancel.`;
          }

          await interaction.followUp({
            content: errorMsg,
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        
        // Handle valid reschedule
        await m.delete().catch(() => {});
        msgCollector.stop('reschedule');

        // Cancel old reminder and delete old event and message
        cancelReminder(id);
        deleteEvent(id);
        await msg.delete().catch(() => {});

        // Create new event
        const newId = createEvent(interaction.user.id, 'planned', input);
        
        if (role) {
          role.members.forEach(member => addInvited(newId, member.id));
        }
        addInvited(newId, interaction.user.id);

        // Send new event message
        const newEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('🔁 Marvel Rivals Game Night (Rescheduled)')
          .addFields(
            { name: 'Event ID', value: `#${newId}` },
            { name: 'RSVP', value: "✅ Available | 🤔 Maybe | ❌ Can't make it | 🔁 Reschedule" }
          );

        const newMsg = await interaction.channel.send({
          content: `🔁 <@${interaction.user.id}> **rescheduled!**\n🗓 **Time:** ${input} (PST)\n${rolePing}`,
          embeds: [newEmbed],
          allowedMentions: { parse: ['roles'] }
        });
        
        // Add reactions
        for (const e of ['✅', '🤔', '❌', '🔁']) await newMsg.react(e);

        // Start RSVP collector on new message
        setupRSVPCollector(newMsg, interaction, rolePing, newId, role, 'planned', input);
        
        // Schedule new reminder
        scheduleReminder(newId, input, interaction.channel, rolePing, interaction.user);

      });

      msgCollector.on('end', (_, reason) => {
        if (reason === 'time') {
          interaction.followUp({
            content: '⌛ Reschedule timed out.',
            flags: MessageFlags.Ephemeral
          });
        }
      });
    }
  });

  collector.on('remove', (reaction, user) => {
    counts[reaction.emoji.name] = Math.max(counts[reaction.emoji.name] - 1, 0);
    if (reaction.emoji.name === '✅') removeAttendee(id, user.id);
  });
}

module.exports = {
  isValidDateTime,
  validateAndAdjustEventTime,
  scheduleReminder,
  setupRSVPCollector
};

