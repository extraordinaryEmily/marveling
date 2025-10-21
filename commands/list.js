const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getAllEvents } = require('../utils/eventManager');
const chrono = require('chrono-node');
const { DateTime } = require('luxon');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('View all active events'),

  async execute(interaction) {
    const events = getAllEvents();
    const eventIds = Object.keys(events);
    const now = DateTime.now().setZone('America/Los_Angeles');

    // Filter out past or expired events
  const activeEventIds = eventIds.filter(id => {
    const event = events[id];

    if ((event.type === 'planned' && event.time) || event.type === 'now') {
      let eventTime;

      if (event.type === 'planned') {
        // ✅ FIX: Use stored ISO timestamps (reliable) instead of re-parsing relative strings
        if (event.eventTimeIso) {
          // Primary: Use the stored absolute event time
          eventTime = DateTime.fromISO(event.eventTimeIso, { zone: 'America/Los_Angeles' });
        } else if (event.reminderTime) {
          // Fallback: Calculate from reminderTime (45 mins before event)
          const reminderTime = DateTime.fromISO(event.reminderTime, { zone: 'America/Los_Angeles' });
          eventTime = reminderTime.plus({ minutes: 45 });
        } else if (event.time) {
          // Last resort: parse the string (may be unreliable)
          const parsed = chrono.parse(event.time, new Date(), { timezone: 'PST' });
          if (parsed && parsed.length > 0) {
            eventTime = DateTime.fromJSDate(parsed[0].start.date()).setZone('America/Los_Angeles');
          }
        }
      } else if (event.type === 'now') {
        // Use creation time or current time for "now" events
        eventTime = DateTime.fromJSDate(new Date(event.time || event.createdAt)).setZone('America/Los_Angeles');
      }

      if (eventTime) {
        // Consider event past if it was more than 30 minutes ago (after the event should have started)
        const eventEndTime = eventTime.plus({ minutes: 30 });
        return eventEndTime > now;
      }
    }

    return true; // Keep event if we can't determine time
  });

    if (activeEventIds.length === 0) {
      return interaction.reply({
        content: '📭 No active events right now. Use `/create` to start one!',
        flags: MessageFlags.Ephemeral
      });
    }

    // Build the event list
    let eventList = '💡 *For full guest list details, use `/guests`*\n\n';

    for (const id of activeEventIds) {
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

