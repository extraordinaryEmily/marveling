const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');
const {
  getEvent,
  deleteEvent,
  createEvent,
  addInvited,
  cancelReminder
} = require('../utils/eventManager');
const { isValidDateTime, validateAndAdjustEventTime } = require('../utils/helper');
const { clearEventCredits, processEventNonResponders, trackReschedule } = require('../utils/achievementManager');
const { cancelReminder: cancelSupabaseReminder } = require('../utils/supabaseClient');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reschedule')
    .setDescription('Reschedule an existing game night')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Event ID to reschedule (e.g. 1001)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('time')
        .setDescription('New date/time (e.g., "Friday 8PM") - All times are PST')
        .setRequired(true)
    ),

  async execute(interaction) {
    const eventId = interaction.options.getString('id').replace('#', '');
    const newTime = interaction.options.getString('time').trim();
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

    // Validate time format
    if (!isValidDateTime(newTime)) {
      return interaction.reply({ 
        content: `❌ "${newTime}" is not valid. Try "Oct 18 5PM" or "Friday 8PM". All times are PST.`, 
        flags: MessageFlags.Ephemeral 
      });
    }

    // Validate and adjust time
    const result = validateAndAdjustEventTime(newTime);

    if (!result.eventTime) {
      return interaction.reply({ content: `❌ Unable to schedule for that time. Please try a different time.`, flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    try {
      // ------------------------
      // [Gateway-free rewrite starts here]
      // ------------------------

      // Role ping from .env instead of fetching
      const rolePing = `<@&${process.env.RIVALING_ROLE_ID}>`;

      // Process non-responders before deleting the event
      const nonResponderAchievements = await processEventNonResponders(event);

      // Cancel old reminder and delete old event
      cancelReminder(eventId);
      cancelSupabaseReminder(eventId).catch(() => {});

      await clearEventCredits(eventId);
      const oldInvited = [...event.invited];
      deleteEvent(eventId);

      // Create new event
      const newId = createEvent(interaction.user.id, 'planned', newTime);
      oldInvited.forEach(userId => addInvited(newId, userId));

      // Track reschedule and check for Eye of Agamotto achievement
      const rescheduleAchievements = await trackReschedule(interaction.user.id, eventId, newId);

      // Send new event message
      const newEmbed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('🔁 Marvel Rivals Game Night (Rescheduled)')
        .addFields(
          { name: 'Event ID', value: `#${newId}` },
          { name: 'RSVP', value: "✅ Available | 🤔 Maybe | ❌ Can't make it | 🔁 Reschedule" }
        );

      // Create RSVP buttons
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`rsvp_yes_${newId}`)
          .setLabel('Available')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`rsvp_maybe_${newId}`)
          .setLabel('Maybe')
          .setEmoji('🤔')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`rsvp_no_${newId}`)
          .setLabel("Can't make it")
          .setEmoji('❌')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`rsvp_reschedule_${newId}`)
          .setLabel('Reschedule')
          .setEmoji('🔁')
          .setStyle(ButtonStyle.Primary)
      );

      // Send reply via interaction instead of channel.send
      await interaction.editReply({
        content: `🔁 <@${interaction.user.id}> rescheduled event #${eventId}!\n🗓 New Time: ${newTime} (PST)\n${rolePing}`,
        embeds: [newEmbed],
        components: [buttons],
        allowedMentions: { parse: ['roles'] }
      });

      // Schedule new reminder
      scheduleReminder(newId, newTime, channel, rolePing, { id: interaction.user.id });

      // Send achievement notifications for non-responders
      if (nonResponderAchievements.length > 0) {
        for (const { userId, achievements } of nonResponderAchievements) {
          const text = achievements.map(a => `<@${userId}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
          await interaction.followUp({ content: text, flags: MessageFlags.Ephemeral });
        }
      }

      // Send achievement notification for reschedule achievement
      if (rescheduleAchievements.length > 0) {
        const text = rescheduleAchievements.map(a => `<@${interaction.user.id}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
        await interaction.followUp({ content: text, flags: MessageFlags.Ephemeral });
      }

      // ------------------------
      // [Gateway-free rewrite ends here]
      // ------------------------

    } catch (err) {
      console.error('Error rescheduling event:', err);
      await interaction.editReply({ content: '❌ Failed to reschedule event: ' + err.message });
    }
  }
};