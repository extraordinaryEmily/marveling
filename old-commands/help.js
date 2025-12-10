const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View all available commands'),

  async execute(interaction) {
    const helpText = 
      `**🦸 Marvel Rivals Bot**\n` +
      `Coordinate game sessions (in PST), squad up with friends, and never miss a Marvel Rivals match!\n\n` +
      `**Commands:**\n` +
      `\`/create\` - Create an impromptu or planned event\n` +
      `\`/list\` - View all active events with confirmed players\n` +
      `\`/guests\` - View the full guest list for a specific event\n` +
      `\`/invite\` - Invite users or add outside guests\n` +
      `\`/reschedule\` - Reschedule a planned game night\n` +
      `\`/delete\` - Cancel and delete an event\n` +
      `\`/achievements\` - View your rankings and achievements\n` +
      `\`/help\` - View this help message`;

    await interaction.reply({
      content: helpText,
      flags: MessageFlags.Ephemeral
    });
  }
};

