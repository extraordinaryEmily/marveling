const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getAllEvents } = require('../utils/eventManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('View all active events'),

  async execute(interaction) {
    const events = getAllEvents();
    const eventIds = Object.keys(events);

    if (eventIds.length === 0) {
      return interaction.reply({
        content: '📭 No active events right now. Use `/create` to start one!',
        flags: MessageFlags.Ephemeral
      });
    }

    // Build the event list
    let eventList = '💡 *For full guest list details, use `/guests`*\n\n';

    for (const id of eventIds) {
      const event = events[id];
      
      // Event type and time
      let eventHeader = `**Event #${id}**`;
      if (event.type === 'planned' && event.time) {
        eventHeader += ` — 📅 ${event.time} (PST)`;
      } else if (event.type === 'now') {
        eventHeader += ` — ⚡ Play Now`;
      }
      
      eventList += `${eventHeader}\n`;
      
      // Host
      eventList += `👑 Host: <@${event.creatorId}>\n`;
      
      // Confirmed attendees
      if (event.attendees.length > 0) {
        const attendeeMentions = event.attendees.map(userId => `<@${userId}>`).join(', ');
        eventList += `✅ Confirmed (${event.attendees.length}): ${attendeeMentions}\n`;
      } else {
        eventList += `✅ Confirmed: None yet\n`;
      }
      
      eventList += `\n`;
    }

    const embed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle('📋 Active Events')
      .setDescription(eventList.trim());

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  }
};

