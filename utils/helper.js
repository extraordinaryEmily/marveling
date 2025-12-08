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
const { trackRSVP, trackMaybe, trackFastRSVP, trackWorthyEvent, clearEventCredits, processEventNonResponders, trackReschedule, checkAvengersAssemble } = require('./achievementManager');
const { scheduleReminder: scheduleSupabaseReminder, cancelReminder: cancelSupabaseReminder } = require('./supabaseClient');
const chrono = require('chrono-node');
const { DateTime } = require('luxon');
/**
 * Parse timeString relative to PST and return a JS Date (UTC) that represents the
 * PST wall-clock time (suitable for scheduling).
 *
 * Returns null if parse fails.
 */
function parsePST(timeString) {
  // Base reference date in PST
  const ourTime = DateTime.now().setZone('America/Los_Angeles');

  // Create a date with PST calendar values in the server's local timezone
  // This ensures Chrono calculates relative dates (tomorrow, next week, etc.) correctly
  const baseJs = new Date(ourTime.year, ourTime.month - 1, ourTime.day, ourTime.hour, ourTime.minute, ourTime.second);

  // Chrono parsing (relative to base date)
  const results = chrono.parse(timeString, baseJs);
  if (!results || results.length === 0) {
    return null;
  }

  const parsedJsDate = results[0].start.date();

  // Interpret that parsed JS date as a wall-clock PST time
  let pstDt = DateTime.fromJSDate(parsedJsDate).setZone('America/Los_Angeles', { keepLocalTime: true });
  // 🔧 PATCH: Fix Chrono "day ahead" issue
  const lowerInput = timeString.toLowerCase();
  const explicitToday = lowerInput.includes('today') || lowerInput.includes('tonight');
  if (explicitToday && pstDt.day === ourTime.plus({ days: 1 }).day) {
    pstDt = pstDt.minus({ days: 1 });
  }

  const backToUtc = pstDt.toUTC();
  return backToUtc.toJSDate();
}

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
  const now = DateTime.now().setZone('America/Los_Angeles');
  const debugInfo = { input: timeString, currentTimePST: now.toLocaleString(DateTime.DATETIME_FULL) };

  // [HELPER] Time validation (called by Create/Reschedule)
  //console.log('\n🕓 Validating event time: "' + timeString + '"');
  // [HELPER] Current time display (called by Create/Reschedule)
  //console.log('📍 Current time: ' + now.toFormat('MMM dd h:mm a') + ' PST');

  // Use parsePST to get a UTC JS Date that corresponds to the PST wall-clock
  let parsedUtcDate = parsePST(timeString);
  if (!parsedUtcDate) {
    debugInfo.error = 'Failed to parse time string';
    return { eventTime: null, debugInfo };
  }

  const eventTime = DateTime.fromJSDate(parsedUtcDate).setZone('America/Los_Angeles', { keepLocalTime: false });

  const lowerInput = timeString.toLowerCase();
  const explicitToday = lowerInput.includes('today') || lowerInput.includes('tonight');
  debugInfo.explicitToday = explicitToday;

  let finalEventTime = DateTime.fromJSDate(parsedUtcDate).setZone('America/Los_Angeles');

  // Handle past times
  if (finalEventTime < now) {
    if (explicitToday) {
      debugInfo.action = '❌ Rejected — user said today but that time has passed.';
      // [HELPER] Time validation failed (called by Create/Reschedule)
      //console.log('❌ That time has already passed today!');
      return { eventTime: null, debugInfo };
    }
    finalEventTime = finalEventTime.plus({ days: 7 });
    debugInfo.action = '⏩ Adjusted — event was in the past, so added 7 days.';
    // [HELPER] Time adjusted (called by Create/Reschedule)
    //console.log('⏩ Time was in the past, added 7 days');
  } else {
    debugInfo.action = '✅ No adjustment needed — event time is in the future.';
  }

  // Safety: disallow events >24 days out
  const maxFuture = now.plus({ days: 24 });
  if (finalEventTime > maxFuture) {
    const daysAhead = finalEventTime.diff(now, 'days').toObject().days.toFixed(1);
    debugInfo.error = `❌ Too far in the future (${daysAhead} days ahead).`;
    return { eventTime: null, debugInfo };
  }

  const utcDate = finalEventTime.toUTC().toJSDate();
  debugInfo.finalEventTimeUTC = finalEventTime.toUTC().toFormat('fff');

  // [HELPER] Event time validated (called by Create/Reschedule)
  //console.log('✅ Event set for: ' + finalEventTime.toFormat('EEE MMM dd h:mm a') + ' PST');

  return { eventTime: utcDate, debugInfo };
}

/**
 * Schedules a reminder 45 minutes before event time, timezone-safe.
 * Stores in Supabase for persistence across bot restarts.
 */
function scheduleReminder(eventId, timeString, channel, rolePing, creator) {
  const { eventTime: utcDate, debugInfo } = validateAndAdjustEventTime(timeString);

  if (!utcDate) {
    // [REMINDERS] Invalid time warning (called by Create/Reschedule)
    //console.error(`⚠️ Event ${eventId}: invalid time, cannot schedule reminder`);
    return false;
  }

  const eventTime = DateTime.fromJSDate(utcDate).setZone('America/Los_Angeles');
  const reminderTime = eventTime.minus({ minutes: 25 }); // 25 min advance (reduced from 45)
  const now = DateTime.now().setZone('America/Los_Angeles');

  const delayMs = reminderTime.diff(now).as('milliseconds');

  if (delayMs <= 0) {
    // [REMINDERS] Reminder time passed (called by Create/Reschedule)
    //console.log(`⚠️ Event ${eventId}: reminder time has already passed`);
    return false;
  }

  // [REMINDERS] Reminder scheduled (called by Create/Reschedule)
  console.log('⏰ Reminder set for: ' + reminderTime.toFormat('EEE MMM dd h:mm a') + ' PST\n');

  // Store the reminder date and actual event time in the event object
  const event = getEvent(eventId);
  if (event) {
    event.reminderTime = reminderTime.toISO();
    event.eventTimeIso = eventTime.toISO(); // Store absolute event time
    
    // Store reminder in Supabase for persistence
    scheduleSupabaseReminder(
      eventId,
      reminderTime.toISO(),
      channel.id,
      event.attendees || []
    ).catch(err => {
      // [REMINDERS] Supabase storage error (called by Create/Reschedule)
      //console.error('Failed to store reminder in Supabase:', err);
    });
  }

  // Also set local timeout if bot is awake (for immediate sending)
  const MAX_TIMEOUT_MS = 2147483647;
  if (delayMs <= MAX_TIMEOUT_MS) {
    const reminderMessages = [
      { title: '⚡ Get on soon!', desc: 'Game night starts in **~25 minutes!**' },
      { title: '🎮 Start updating!', desc: 'Make sure your game is up to date!' },
      { title: '🦸 Get ready to play!', desc: 'Suit up! Game time in **~25 minutes!**' },
      { title: '🔥 Almost time!', desc: 'Game night kicks off in **~25 minutes!**' },
      { title: '💥 Heads up!', desc: "We're playing in **~25 minutes!**" },
      { title: '🎯 Game time approaching!', desc: 'Lock in! Game starts soon!' },
      { title: '⚔️ Assemble soon!', desc: 'Heroes needed in **~25 minutes!**' }
    ];
    
    const timeoutId = setTimeout(async () => {
      const event = getEvent(eventId);
      if (!event) return;

      // Check if reminder was already sent by cron (prevent duplicate)
      const { checkIfReminderSent } = require('./supabaseClient');
      const alreadySent = await checkIfReminderSent(eventId);
      
      if (alreadySent) {
        // [REMINDERS] Duplicate prevention (called by local setTimeout)
        //console.log(`⏭️  Reminder for event #${eventId} was already sent by cron, skipping`);
        return;
      }

      const attendeeMentions = event.attendees.map(id => `<@${id}>`).join(' ');
      const randomMsg = reminderMessages[Math.floor(Math.random() * reminderMessages.length)];

      const embed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle(randomMsg.title)
        .setDescription(randomMsg.desc)
        .setImage('https://giffiles.alphacoders.com/223/223284.gif')
        .addFields({ name: 'Event ID', value: `#${eventId}` });

      await channel.send({
        content: attendeeMentions ? `⏰ ${attendeeMentions}` : `⏰ ${rolePing}`,
        embeds: [embed],
        allowedMentions: { parse: ['users', 'roles'] }
      });
      
      // Mark as sent in Supabase to prevent duplicate from cron
      const { markReminderSentByEventId } = require('./supabaseClient');
      await markReminderSentByEventId(eventId).catch(err => {
        // [REMINDERS] Error marking sent (called by local setTimeout)
        //console.error('Failed to mark reminder as sent in Supabase:', err);
      });
    }, delayMs);

    setReminder(eventId, timeoutId, channel.id, null);
  }
  
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
      
      // Track RSVP achievement (only for Available) - pass eventId to prevent farming
      const rsvpAchievements = trackRSVP(user.id, id);
      achievements.push(...rsvpAchievements);
      
      // Check for fast RSVP (within 30 seconds, not your own event)
      if (event && user.id !== event.creatorId) {
        const timeSinceCreation = (Date.now() - event.createdAt) / 1000; // seconds
        if (timeSinceCreation <= 30) {
          const bullseyeAchievements = trackFastRSVP(user.id, id);
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
      
      // Check for Avengers Assemble achievement (everyone RSVPs)
      if (event) {
        const avengersAchievements = checkAvengersAssemble(event);
        if (avengersAchievements.length > 0) {
          const avengersText = avengersAchievements.map(({ userId, achievements }) => 
            achievements.map(a => `<@${userId}> unlocked ${a.emoji} **${a.name}**!`).join('\n')
          ).join('\n');
          msg.channel.send(avengersText).catch(() => {});
        }
      }
    }
    else if (reaction.emoji.name === '❌') {
      removeAttendee(id, user.id);
    }
    else if (reaction.emoji.name === '🤔') {
      // Track Maybe responses - pass eventId to prevent farming
      const maybeAchievements = trackMaybe(user.id, id);
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

        // Process non-responders before deleting the event
        const event = getEvent(id);
        const nonResponderAchievements = processEventNonResponders(event);

        // Cancel old reminder and delete old event and message
        cancelReminder(id);
        cancelSupabaseReminder(id).catch(err => console.error('Failed to cancel Supabase reminder:', err));
        clearEventCredits(id);
        deleteEvent(id);
        await msg.delete().catch(() => {});
        
        // Send achievement notifications for non-responders
        if (nonResponderAchievements.length > 0) {
          for (const { userId, achievements } of nonResponderAchievements) {
            const achievementText = achievements.map(a => `<@${userId}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
            await interaction.channel.send(achievementText).catch(() => {});
          }
        }

        // Create new event
        const newId = createEvent(interaction.user.id, 'planned', input);
        
        if (role) {
          role.members.forEach(member => addInvited(newId, member.id));
        }
        addInvited(newId, interaction.user.id);

        // Track reschedule and check for Eye of Agamotto achievement
        const rescheduleAchievements = trackReschedule(interaction.user.id, id, newId);

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

        // Send achievement notification for reschedule achievement
        if (rescheduleAchievements.length > 0) {
          const achievementText = rescheduleAchievements.map(a => 
            `<@${interaction.user.id}> unlocked ${a.emoji} **${a.name}**!`
          ).join('\n');
          await interaction.channel.send(achievementText).catch(() => {});
        }

      });

      msgCollector.on('end', (_, reason) => {
        if (reason === 'time') {
          interaction.followUp({
            content: '⌛ Reschedule timed out.',
            flags: MessageFlags.Ephemeral
          }).catch(err => console.error('Error sending timeout message:', err));
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
  setupRSVPCollector,
  parsePST
};

