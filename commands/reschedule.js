const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const {
  getEvent,
  deleteEvent,
  createEvent,
  addInvited,
  cancelReminder
} = require('../utils/eventManager');
const { isValidDateTime, validateAndAdjustEventTime, scheduleReminder, setupRSVPCollector } = require('../utils/helper');
const { clearEventCredits, processEventNonResponders, trackReschedule } = require('../utils/achievementManager');
const { registerCommandState, completeUserCommand } = require('../utils/commandStateManager');
const { cancelReminder: cancelSupabaseReminder } = require('../utils/supabaseClient');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reschedule')
    .setDescription('Reschedule an existing game night')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Event ID to reschedule (e.g. 1001)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const eventId = interaction.options.getString('id').replace('#', '');
    const event = getEvent(eventId);

    // Validate event exists
    if (!event) {
      return interaction.reply({ 
        content: `❌ Event #${eventId} not found.`, 
        flags: MessageFlags.Ephemeral 
      });
    }

    // Check if event is planned (can't reschedule "play now" events)
    if (event.type !== 'planned') {
      return interaction.reply({ 
        content: `❌ You cannot reschedule "Play Now" sessions.`, 
        flags: MessageFlags.Ephemeral 
      });
    }

    // Only creator can reschedule
    if (interaction.user.id !== event.creatorId) {
      return interaction.reply({ 
        content: `🚫 Only the host can reschedule this event.`, 
        flags: MessageFlags.Ephemeral 
      });
    }

    // Prompt for new time
    await interaction.reply({
      content: '🗓 What\'s the new time?\n💡 Type your answer in the channel (e.g., "Friday 8PM" or "Oct 18 5PM")\n💡 All times are PST\n💡 Type "cancel" to abort',
      flags: MessageFlags.Ephemeral
    });

    // Store state to wait for message
    registerCommandState(interaction.user.id, 'reschedule', {
      step: 'awaiting_time',
      eventId: eventId,
      guildId: interaction.guild.id,
      channelId: interaction.channel.id,
      timestamp: Date.now()
    });
  },

  // Handle the time message (called from index.js message event)
  async handleTimeMessage(message, client) {
    const { getUserCommandState } = require('../utils/commandStateManager');
    const commandState = getUserCommandState(message.author.id);
    
    if (!commandState || commandState.commandName !== 'reschedule' || !commandState.collectors) {
      return false; // Not handling this message
    }

    const state = commandState.collectors; // Our state data is stored in collectors param
    
    if (state.step !== 'awaiting_time') {
      return false; // Not waiting for time input
    }

    // Check if message is in the right channel
    if (message.channel.id !== state.channelId) {
      return false;
    }

    // Timeout after 60 seconds
    if (Date.now() - state.timestamp > 60000) {
      completeUserCommand(message.author.id);
      await message.channel.send(`<@${message.author.id}> ⏰ Timed out. Try \`/reschedule\` again.`);
      return true;
    }

    const input = message.content.trim();

    // Handle cancellation
    if (input.toLowerCase() === 'cancel' || input.toLowerCase() === 'no') {
      await message.delete().catch(() => {});
      await message.channel.send(`<@${message.author.id}> 🛑 Reschedule cancelled.`);
      completeUserCommand(message.author.id);
      return true;
    }

    // Validate time format
    if (!isValidDateTime(input)) {
      await message.reply(`❌ "${input}" is not valid. Try "Oct 18 5PM" or "Friday 8PM".`);
      return true; // We handled it, but keep waiting
    }

    // Validate and adjust time
    const result = validateAndAdjustEventTime(input);

    if (!result.eventTime) {
      const errorMsg = result.debugInfo.explicitToday 
        ? `❌ That time has already passed today! (All times are PST)`
        : `❌ Unable to schedule for that time. Please try a different time.`;
      await message.reply(errorMsg);
      return true; // We handled it, but keep waiting
    }

    // Delete the user's message
    await message.delete().catch(() => {});

    // Get event, guild, and channel
    const eventId = state.eventId;
    const event = getEvent(eventId);
    
    if (!event) {
      await message.channel.send(`<@${message.author.id}> ❌ Event #${eventId} was deleted.`);
      completeUserCommand(message.author.id);
      return true;
    }

    const guild = await client.guilds.fetch(state.guildId);
    const channel = await client.channels.fetch(state.channelId);
    const role = guild.roles.cache.find(r => r.name === 'rivaling');
    const rolePing = role ? `<@&${role.id}>` : '@rivaling';

    // Process non-responders before deleting the event
    const nonResponderAchievements = await processEventNonResponders(event);

    // Cancel old reminder and delete old event
    cancelReminder(eventId);
    // [RESCHEDULE] Error cancelling Supabase reminder
    cancelSupabaseReminder(eventId).catch(err => {/*console.error('Failed to cancel Supabase reminder:', err)*/});
    await clearEventCredits(eventId);
    const oldInvited = [...event.invited];
    deleteEvent(eventId);

    // Create new event
    const newId = createEvent(message.author.id, 'planned', input);
    oldInvited.forEach(userId => addInvited(newId, userId));

    // Track reschedule and check for Eye of Agamotto achievement
    const rescheduleAchievements = await trackReschedule(message.author.id, eventId, newId);

    // Send new event message
    const newEmbed = new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('🔁 Marvel Rivals Game Night (Rescheduled)')
      .addFields(
        { name: 'Event ID', value: `#${newId}` },
        { name: 'RSVP', value: "✅ Available | 🤔 Maybe | ❌ Can't make it | 🔁 Reschedule" }
      );

    const newMsg = await channel.send({
      content: `🔁 <@${message.author.id}> **rescheduled event #${eventId}!**\n🗓 **New Time:** ${input} (PST)\n${rolePing}`,
      embeds: [newEmbed],
      allowedMentions: { parse: ['roles'] }
    });

    // Add reactions
    for (const e of ['✅', '🤔', '❌', '🔁']) await newMsg.react(e);

    // Set up RSVP collector (enables reaction tracking and auto-reschedule)
    setupRSVPCollector(newMsg, { 
      user: { id: message.author.id }, 
      guild: guild, 
      channel: channel 
    }, rolePing, newId, role, 'planned', input);

    // Schedule new reminder
    scheduleReminder(newId, input, channel, rolePing, { id: message.author.id });

    // Send achievement notifications for non-responders
    if (nonResponderAchievements.length > 0) {
      for (const { userId, achievements } of nonResponderAchievements) {
        const achievementText = achievements.map(a => `<@${userId}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
        await channel.send(achievementText).catch(() => {});
      }
    }

    // Send achievement notification for reschedule achievement
    if (rescheduleAchievements.length > 0) {
      const achievementText = rescheduleAchievements.map(a => 
        `<@${message.author.id}> unlocked ${a.emoji} **${a.name}**!`
      ).join('\n');
      await channel.send(achievementText).catch(() => {});
    }
    
    // Command completed successfully
    completeUserCommand(message.author.id);
    return true; // We handled this message
  }
};
