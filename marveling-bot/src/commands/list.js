export async function handleListCommand(events, userId) {
    const eventIds = Object.keys(events);
    const now = new Date();

    const activeEventIds = eventIds.filter(id => {
      const event = events[id];
      if ((event.type === 'planned' && event.time) || event.type === 'now') {
        let eventTime;
        if (event.type === 'planned') {
          if (event.eventTimeIso) {
            eventTime = new Date(event.eventTimeIso);
          } else if (event.reminderTime) {
            const reminderTime = new Date(event.reminderTime);
            eventTime = new Date(reminderTime.getTime() + 45 * 60 * 1000);
          } else if (event.time) {
            return true;
          }
        } else if (event.type === 'now') {
          eventTime = new Date(event.time || event.createdAt);
        }
        if (eventTime) {
          const eventEndTime = new Date(eventTime.getTime() + 30 * 60 * 1000);
          return eventEndTime > now;
        }
      }
      return true;
    });

    if (activeEventIds.length === 0) {
      return {
        content: '📭 No active events right now. Use `/playnow` or `/plan` to start one!',
        flags: 64
      };
    }

    let eventList = '💡 *For full guest list details, use `/guests`*\n\n';
    for (const id of activeEventIds) {
      const event = events[id];
      let eventHeader = `**Event #${id}**`;
      if (event.type === 'planned' && event.time) {
        eventHeader += ` — 📅 ${event.time} (PST)`;
      } else if (event.type === 'now') {
        eventHeader += ` — ⚡ Play Now`;
      }
      eventList += `${eventHeader}\n👑 Host: <@${event.creatorId}>\n`;
      if (event.attendees && event.attendees.length > 0) {
        eventList += `✅ Confirmed (${event.attendees.length}): ${event.attendees.map(u => `<@${u}>`).join(', ')}\n`;
      } else {
        eventList += `✅ Confirmed: None yet\n`;
      }
      eventList += `\n`;
    }

    return {
      embeds: [{
        color: 0xff6b6b,
        title: '📋 Active Events',
        description: eventList.trim()
      }],
      flags: 64
    };
  }