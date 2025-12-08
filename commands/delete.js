const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { deleteEvent, getEvent, cancelReminder } = require('../utils/eventManager');
const { clearEventCredits, processEventNonResponders } = require('../utils/achievementManager');
const { cancelReminder: cancelSupabaseReminder } = require('../utils/supabaseClient');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete an existing event')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Event ID to delete (e.g. 1001)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const id = interaction.options.getString('id').replace('#', '');
    const event = getEvent(id);

    if (!event) {
      return interaction.reply({ content: `❌ Event #${id} not found.`, flags: MessageFlags.Ephemeral });
    }

    // Only creator (or admin) can delete
    if (interaction.user.id !== event.creatorId && !interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: `🚫 You're not allowed to delete this event.`, flags: MessageFlags.Ephemeral });
    }

    // Process non-responders before deleting the event
    const nonResponderAchievements = processEventNonResponders(event);
    
    // Cancel any scheduled reminders
    cancelReminder(id);
    // [DELETE] Error cancelling Supabase reminder
    cancelSupabaseReminder(id).catch(err => {/*console.error('Failed to cancel Supabase reminder:', err)*/});
    // Clear achievement tracking for this event
    clearEventCredits(id);
    deleteEvent(id);
    
    await interaction.reply(`🗑️ Event #${id} has been deleted.`);
    
    // Send achievement notifications for non-responders
    if (nonResponderAchievements.length > 0) {
      for (const { userId, achievements } of nonResponderAchievements) {
        const achievementText = achievements.map(a => `<@${userId}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
        await interaction.followUp({ content: achievementText });
      }
    }
  },
};
