const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { deleteEvent, getEvent } = require('../utils/eventManager'); 
// ⬆️ Removed cancelReminder (no timers in Workers/serverless)

// Achievement utils stay the same
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

    // Only creator can delete (removed admin check since we can't access permissions)
    if (interaction.user.id !== event.creatorId) {
      return interaction.reply({ content: `🚫 You're not allowed to delete this event.`, flags: MessageFlags.Ephemeral });
    }

    // ----------------------------
    // Here is the first major fix
    // ----------------------------

    // Process non-responders BEFORE deletion
    const nonResponderAchievements = await processEventNonResponders(event);

    // ❌ Removed: cancelReminder(id)
    // Because eventManager no longer stores timeoutIds

    // ✔ You can KEEP supabase canceling IF your reminders are database-driven
    cancelSupabaseReminder(id).catch(() => { /* silent */ });

    // Clear achievement progress for this event
    await clearEventCredits(id);
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

