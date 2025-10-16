const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getEvent } = require('../utils/eventManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guests')
    .setDescription('See who has been invited or RSVP’d for an event')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Event ID to view (e.g. 1001)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const id = interaction.options.getString('id').replace('#', '');
    const event = getEvent(id);

    if (!event) {
      return interaction.reply({ content: `❌ Event #${id} not found.`, flags: MessageFlags.Ephemeral });
    }

    // Invited users (inside server + manually invited)
    const invited = event.invited?.length > 0
      ? event.invited.map(u => `<@${u}>`).join(', ')
      : 'None';

    // RSVP’d users (✅ only)
    const rsvp = event.attendees?.length > 0
      ? event.attendees.map(u => `<@${u}>`).join(', ')
      : 'None';

    // Outside guests (+1s)
    const outsideGuests = event.guests?.length > 0
      ? event.guests.map(g => `${g.username} (+${g.count})`).join(', ')
      : 'None';

    const reply =
      `💡 *Use \`/invite\` to invite more people*\n\n` +
      `**🎮 Event #${id} — Guests**\n\n` +
      `👥 **Invited:** ${invited}\n` +
      `✅ **RSVP'd:** ${rsvp}\n` +
      `🌐 **Outside Guests:** ${outsideGuests}`;

    await interaction.reply({ content: reply, flags: MessageFlags.Ephemeral });
  }
};
