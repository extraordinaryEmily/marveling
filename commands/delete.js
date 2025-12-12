const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { deleteEvent, getEvent } = require('../utils/eventManager'); 
const { clearEventCredits, processEventNonResponders } = require('../utils/achievementManager');
const { cancelReminder: cancelSupabaseReminder } = require('../utils/supabaseClient');

// Cloudflare-compatible handler function
// Returns { response, needsDelete, eventId, followUps }
async function handleDeleteCommandCloudflare(events, eventId, userId) {
  const event = events[eventId];

  if (!event) {
    return {
      response: {
        content: `❌ Event #${eventId} not found.`,
        flags: 64 // EPHEMERAL
      }
    };
  }

  // Only creator can delete
  if (userId !== event.creatorId) {
    return {
      response: {
        content: `🚫 You're not allowed to delete this event!`,
        flags: 64 // EPHEMERAL
      }
    };
  }

  // Process non-responders (simplified for Cloudflare - would need achievement manager)
  // For now, just return the delete response
  const followUps = []; // Would contain achievement notifications

  return {
    response: {
      content: `🗑️ Event #${eventId} has been deleted.`
    },
    needsDelete: true,
    eventId: eventId,
    followUps: followUps
  };
}

// Original Discord.js handler
async function executeDeleteCommand(interaction) {
  const id = interaction.options.getString('id').replace('#', '');
  const event = getEvent(id);

  if (!event) {
    return interaction.reply({ content: `❌ Event #${id} not found.`, flags: MessageFlags.Ephemeral });
  }

  // Only creator can delete (removed admin check since we can't access permissions)
  if (interaction.user.id !== event.creatorId) {
    return interaction.reply({ content: `🚫 You're not allowed to delete this event!!`, flags: MessageFlags.Ephemeral });
  }

  // Process non-responders BEFORE deletion
  const nonResponderAchievements = await processEventNonResponders(event);

  // Cancel supabase reminder
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
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete an existing event')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Event ID to delete (e.g. 1001)')
        .setRequired(true)
    ),
  execute: executeDeleteCommand,
  handleCloudflare: handleDeleteCommandCloudflare
};
