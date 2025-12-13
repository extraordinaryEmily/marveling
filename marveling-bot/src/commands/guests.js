export function handleGuestsCommand(interaction, events) {
    // ===== 1. Extract Event ID from interaction =====
    const eventId = interaction.data.options
      ?.find(opt => opt.name === 'id')
      ?.value
      ?.replace('#', '');
  
    if (!eventId) {
      return { content: '❌ Event ID is required.', flags: 64 };
    }
  
    // ===== 2. Lookup the event =====
    const event = events[eventId];
  
    if (!event) {
      return { content: `❌ Event #${eventId} not found.`, flags: 64 };
    }
  
    // ===== 3. Format Guests =====
    const invited =
      event.invited?.length > 0
        ? event.invited.map(u => `<@${u}>`).join(', ')
        : 'None';
  
    const rsvp =
      event.attendees?.length > 0
        ? event.attendees.map(u => `<@${u}>`).join(', ')
        : 'None';
  
    const outsideGuests =
      event.guests?.length > 0
        ? event.guests.map(g => `${g.username} (+${g.count})`).join(', ')
        : 'None';
  
    // ===== 4. Build Content =====
    return {
      content:
        `💡 *Use \`/invite\` to invite more people*\n\n` +
        `**🎮 Event #${eventId} — Guests**\n\n` +
        `👥 **Invited:** ${invited}\n` +
        `✅ **RSVP'd:** ${rsvp}\n` +
        `🌐 **Outside Guests:** ${outsideGuests}`,
      flags: 64
    };
  }