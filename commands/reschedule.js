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
      content: '🗓 What\'s the new time?',
      flags: MessageFlags.Ephemeral
    });

    const msgCollector = interaction.channel.createMessageCollector({
      filter: m => m.author.id === interaction.user.id,
      time: 60000
    });

    // Register this command state to cancel any previous commands
    registerCommandState(interaction.user.id, 'reschedule', { messageCollector: msgCollector });

    msgCollector.on('collect', async m => {
      const input = m.content.trim();

      // Handle cancellation
      if (input.toLowerCase() === 'cancel' || input.toLowerCase() === 'no') {
        await m.delete().catch(() => {});
        msgCollector.stop('cancel');
        await interaction.followUp({
          content: '🛑 Reschedule cancelled.',
          flags: MessageFlags.Ephemeral
        });
        completeUserCommand(interaction.user.id);
        return;
      }

      // Validate time format
      if (!isValidDateTime(input)) {
        await interaction.followUp({
          content: `❌ "${input}" is not valid. Try "Oct 18 5PM" or "Friday 8PM".`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // Validate and adjust time
      const result = validateAndAdjustEventTime(input);

      if (!result.eventTime) {
        const errorMsg = result.debugInfo.explicitToday 
          ? `❌ That time has already passed today! (All times are PST)`
          : `❌ Unable to schedule for that time. Please try a different time.`;
        await interaction.followUp({
          content: errorMsg,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      msgCollector.stop('success');
      await m.delete().catch(() => {});

      // Get role for pinging
      const role = interaction.guild.roles.cache.find(r => r.name === 'rivaling');
      const rolePing = role ? `<@&${role.id}>` : '@rivaling';

      // Process non-responders before deleting the event
      const nonResponderAchievements = processEventNonResponders(event);

      // Cancel old reminder and delete old event
      cancelReminder(eventId);
      cancelSupabaseReminder(eventId).catch(err => console.error('Failed to cancel Supabase reminder:', err));
      clearEventCredits(eventId);
      const oldInvited = [...event.invited];
      deleteEvent(eventId);

      // Create new event
      const newId = createEvent(interaction.user.id, 'planned', input);
      oldInvited.forEach(userId => addInvited(newId, userId));

      // Track reschedule and check for Eye of Agamotto achievement
      const rescheduleAchievements = trackReschedule(interaction.user.id, eventId, newId);

      // Send new event message
      const newEmbed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('🔁 Marvel Rivals Game Night (Rescheduled)')
        .addFields(
          { name: 'Event ID', value: `#${newId}` },
          { name: 'RSVP', value: "✅ Available | 🤔 Maybe | ❌ Can't make it | 🔁 Reschedule" }
        );

      const newMsg = await interaction.channel.send({
        content: `🔁 <@${interaction.user.id}> **rescheduled event #${eventId}!**\n🗓 **New Time:** ${input} (PST)\n${rolePing}`,
        embeds: [newEmbed],
        allowedMentions: { parse: ['roles'] }
      });

      // Add reactions
      for (const e of ['✅', '🤔', '❌', '🔁']) await newMsg.react(e);

      // Set up RSVP collector (enables reaction tracking and auto-reschedule)
      setupRSVPCollector(newMsg, interaction, rolePing, newId, role, 'planned', input);

      // Schedule new reminder
      scheduleReminder(newId, input, interaction.channel, rolePing, interaction.user);

      // Send achievement notifications for non-responders
      if (nonResponderAchievements.length > 0) {
        for (const { userId, achievements } of nonResponderAchievements) {
          const achievementText = achievements.map(a => `<@${userId}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
          await interaction.channel.send(achievementText).catch(() => {});
        }
      }

      // Send achievement notification for reschedule achievement
      if (rescheduleAchievements.length > 0) {
        const achievementText = rescheduleAchievements.map(a => 
          `<@${interaction.user.id}> unlocked ${a.emoji} **${a.name}**!`
        ).join('\n');
        await interaction.channel.send(achievementText).catch(() => {});
      }
      
      // Command completed successfully
      completeUserCommand(interaction.user.id);
    });

    msgCollector.on('end', (collected, reason) => {
      if (reason === 'time') {
        interaction.followUp({ 
          content: '⏰ Timed out. Try `/reschedule` again.', 
          flags: MessageFlags.Ephemeral 
        }).catch(err => console.error('Error sending timeout message:', err));
        completeUserCommand(interaction.user.id);
      }
    });
  }
};

