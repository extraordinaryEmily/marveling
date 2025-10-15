const { SlashCommandBuilder } = require('discord.js');
const { deleteEvent, getEvent, cancelReminder } = require('../utils/eventManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete an existing Marveling event')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Event ID to delete (e.g. 1001)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const id = interaction.options.getString('id').replace('#', '');
    const event = getEvent(id);

    if (!event) {
      return interaction.reply({ content: `❌ Event #${id} not found.`, ephemeral: true });
    }

    // Only creator (or admin) can delete
    if (interaction.user.id !== event.creatorId && !interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: `🚫 You're not allowed to delete this event.`, ephemeral: true });
    }

    // Cancel any scheduled reminders
    cancelReminder(id);
    deleteEvent(id);
    await interaction.reply(`🗑️ Event #${id} has been deleted.`);
  },
};
