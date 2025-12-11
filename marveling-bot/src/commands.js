// Commands bridge - exports Cloudflare-compatible handlers
// These functions mirror the handleCloudflare functions from the command files
// This allows the Cloudflare Worker to use them as ES modules

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

export function handleHelpCommand() {
  return {
    content: `**🦸 Marvel Rivals Bot**\nCoordinate game sessions (in PST), squad up with friends, and never miss a Marvel Rivals match!\n\n**Commands:**\n\`/playnow\` - Create an immediate play session\n\`/plan\` - Plan a game night at a specific date/time\n\`/list\` - View all active events with confirmed players\n\`/guests\` - View the full guest list for a specific event\n\`/invite\` - Invite users or add outside guests\n\`/reschedule\` - Reschedule a planned game night\n\`/delete\` - Cancel and delete an event\n\`/achievements\` - View your rankings and achievements\n\`/help\` - View this help message`,
    flags: 64
  };
}

export function handleGuestsCommand(events, eventId) {
  const event = events[eventId];
  if (!event) {
    return { content: `❌ Event #${eventId} not found.`, flags: 64 };
  }
  const invited = event.invited?.length > 0 ? event.invited.map(u => `<@${u}>`).join(', ') : 'None';
  const rsvp = event.attendees?.length > 0 ? event.attendees.map(u => `<@${u}>`).join(', ') : 'None';
  const outsideGuests = event.guests?.length > 0 ? event.guests.map(g => `${g.username} (+${g.count})`).join(', ') : 'None';
  return {
    content: `💡 *Use \`/invite\` to invite more people*\n\n**🎮 Event #${eventId} — Guests**\n\n👥 **Invited:** ${invited}\n✅ **RSVP'd:** ${rsvp}\n🌐 **Outside Guests:** ${outsideGuests}`,
    flags: 64
  };
}

export async function handleInviteCommand(events, eventId, userId, username, personId, guestString) {
  const event = events[eventId];
  if (!event) return { response: { content: `❌ Event #${eventId} not found.`, flags: 64 } };
  if (personId && guestString) return { response: { content: `⚠️ Choose either **@person** OR **+guests**, not both.`, flags: 64 } };
  if (!personId && !guestString) return { response: { content: `⚠️ Please tag a person or add guests (+1, +2).`, flags: 64 } };
  
  if (personId) {
    if (personId === userId) return { response: { content: `⚠️ You can't invite yourself!`, flags: 64 } };
    if (!event.invited) event.invited = [];
    if (!event.invited.includes(personId)) event.invited.push(personId);
    return { response: { content: `📩 Invited <@${personId}> to event #${eventId}!` }, needsSave: true, updatedEvent: event };
  }
  
  if (!/^\+\d+$/.test(guestString.trim())) return { response: { content: `⚠️ Invalid format. Use +1, +2, etc.`, flags: 64 } };
  const guestCount = parseInt(guestString.replace('+', ''), 10);
  const currentTotal = (event.guests || []).filter(g => g.userId === userId).reduce((total, g) => total + g.count, 0);
  const newTotal = currentTotal + guestCount;
  if (newTotal > 5) {
    const remaining = 5 - currentTotal;
    return { response: { content: remaining <= 0 ? `⚠️ You've already invited the maximum of **5 guests** for this event.` : `⚠️ You can only invite **${remaining} more guest(s)** for this event (currently at ${currentTotal}/5).`, flags: 64 } };
  }
  if (!event.guests) event.guests = [];
  event.guests.push({ userId, username, count: guestCount });
  return { response: { content: `🌐 ${username} invited **${guestString}** guest(s) to event #${eventId} (${newTotal}/5 total).` }, needsSave: true, updatedEvent: event };
}

export async function handleDeleteCommand(events, eventId, userId) {
  const event = events[eventId];
  if (!event) return { response: { content: `❌ Event #${eventId} not found.`, flags: 64 } };
  if (userId !== event.creatorId) return { response: { content: `🚫 You're not allowed to delete this event.`, flags: 64 } };
  return { response: { content: `🗑️ Event #${eventId} has been deleted.` }, needsDelete: true, eventId, followUps: [] };
}

export function handlePlaynowCommand(userId, username, roleId, nextEventId) {
  const rolePing = roleId ? `<@&${roleId}>` : '@rivaling';
  return {
    response: {
      content: `${rolePing} — <@${userId}> needs heroes! **Assemble NOW!**\n\n✅ Play now event #${nextEventId} created!`,
      embeds: [{
        color: 0x00aeff,
        title: '⚡ Avengers assemble!',
        image: { url: 'https://i.imgur.com/pMPmPef.gif' },
        fields: [{ name: 'Event ID', value: `#${nextEventId}` }, { name: 'RSVP', value: "✅ I'm coming! | ⛔ Can't make it" }]
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, label: "I'm coming!", emoji: { name: '✅' }, custom_id: `rsvp_yes_${nextEventId}` },
          { type: 2, style: 4, label: "Can't make it", emoji: { name: '⛔' }, custom_id: `rsvp_no_${nextEventId}` }
        ]
      }]
    },
    newEvent: {
      id: nextEventId,
      creatorId: userId,
      type: 'now',
      time: Date.now(),
      invited: [userId],
      attendees: [],
      maybe: [],
      guests: [],
      createdAt: Date.now(),
      channelId: null,
      eventTimeIso: null,
      reminderTime: null
    },
    followUps: []
  };
}

export function handlePlanCommand(userId, time, nextEventId, roleId, channelId, eventTimeIso, reminderTimeIso) {
  if (!time || time.trim().length === 0) {
    return { response: { content: `❌ "${time}" doesn't look valid. Try "today 5PM", "Friday 8PM" or "10/18 5PM". All times are PST.`, flags: 64 } };
  }
  const rolePing = roleId ? `<@&${roleId}>` : '@rivaling';
  return {
    response: {
      content: `${rolePing} — <@${userId}> is planning a game night!\n🗓 **Time:** ${time} (PST)\n\n✅ Event #${nextEventId} created!`,
      embeds: [{
        color: 0xff0000,
        title: '📅 Marvel Rivals Game Night',
        fields: [{ name: 'Event ID', value: `#${nextEventId}` }, { name: 'RSVP', value: "✅ Available | 🤔 Maybe | ⛔ Can't make it | 🔁 Reschedule" }]
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, label: 'Available', emoji: { name: '✅' }, custom_id: `rsvp_yes_${nextEventId}` },
          { type: 2, style: 2, label: 'Maybe', emoji: { name: '🤔' }, custom_id: `rsvp_maybe_${nextEventId}` },
          { type: 2, style: 4, label: "Can't make it", emoji: { name: '⛔' }, custom_id: `rsvp_no_${nextEventId}` },
          { type: 2, style: 1, label: 'Reschedule', emoji: { name: '🔁' }, custom_id: `rsvp_reschedule_${nextEventId}` }
        ]
      }]
    },
    newEvent: {
      id: nextEventId,
      creatorId: userId,
      type: 'planned',
      time: time,
      invited: [userId],
      attendees: [],
      maybe: [],
      guests: [],
      createdAt: Date.now(),
      channelId: channelId,
      eventTimeIso: eventTimeIso,
      reminderTime: reminderTimeIso
    },
    reminderData: reminderTimeIso ? { eventId: nextEventId, reminderTime: reminderTimeIso, channelId, attendees: [] } : null,
    followUps: []
  };
}

export function handleRescheduleCommand(events, eventId, userId, newTime, nextEventId, roleId, channelId, eventTimeIso, reminderTimeIso) {
  const event = events[eventId];
  if (!event) return { response: { content: `❌ Event #${eventId} not found.`, flags: 64 } };
  if (event.type !== 'planned') return { response: { content: `❌ You cannot reschedule "Play Now" sessions.`, flags: 64 } };
  if (userId !== event.creatorId) return { response: { content: `🚫 Only the host can reschedule this event.`, flags: 64 } };
  if (!newTime || newTime.trim().length === 0) return { response: { content: `❌ "${newTime}" is not valid. Try "Oct 18 5PM" or "Friday 8PM". All times are PST.`, flags: 64 } };
  
  const rolePing = roleId ? `<@&${roleId}>` : '@rivaling';
  const oldInvited = [...(event.invited || [])];
  return {
    response: {
      content: `🔁 <@${userId}> rescheduled event #${eventId}!\n🗓 New Time: ${newTime} (PST)\n${rolePing}`,
      embeds: [{
        color: 0x00ff88,
        title: '🔁 Marvel Rivals Game Night (Rescheduled)',
        fields: [{ name: 'Event ID', value: `#${nextEventId}` }, { name: 'RSVP', value: "✅ Available | 🤔 Maybe | ⛔ Can't make it | 🔁 Reschedule" }]
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, label: 'Available', emoji: { name: '✅' }, custom_id: `rsvp_yes_${nextEventId}` },
          { type: 2, style: 2, label: 'Maybe', emoji: { name: '🤔' }, custom_id: `rsvp_maybe_${nextEventId}` },
          { type: 2, style: 4, label: "Can't make it", emoji: { name: '⛔' }, custom_id: `rsvp_no_${nextEventId}` },
          { type: 2, style: 1, label: 'Reschedule', emoji: { name: '🔁' }, custom_id: `rsvp_reschedule_${nextEventId}` }
        ]
      }],
      allowed_mentions: { parse: ['roles'] }
    },
    needsDelete: true,
    oldEventId: eventId,
    newEvent: {
      id: nextEventId,
      creatorId: userId,
      type: 'planned',
      time: newTime,
      invited: oldInvited,
      attendees: [],
      maybe: [],
      guests: [],
      createdAt: Date.now(),
      channelId: channelId,
      eventTimeIso: eventTimeIso,
      reminderTime: reminderTimeIso
    },
    reminderData: reminderTimeIso ? { eventId: nextEventId, reminderTime: reminderTimeIso, channelId, attendees: [] } : null,
    followUps: []
  };
}

export function handleAchievementsCommand(targetUserId, targetUsername, targetAvatar, stats, ranks, legendaryAchievements) {
  const avatarURL = targetAvatar 
    ? `https://cdn.discordapp.com/avatars/${targetUserId}/${targetAvatar}.${targetAvatar.startsWith('a_') ? 'gif' : 'png'}?size=256`
    : `https://cdn.discordapp.com/embed/avatars/${(parseInt(targetUserId) >> 22) % 6}.png`;
  
  function createProgressBar(current, target) {
    const percentage = Math.min(current / target, 1);
    const barLength = 10;
    const filledLength = Math.round(percentage * barLength);
    return `${'█'.repeat(filledLength)}${'░'.repeat(barLength - filledLength)} ${Math.round(percentage * 100)}%`;
  }
  
  function toTitleCase(str) {
    return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }
  
  const embed = {
    color: 0xff0000,
    title: `🏆 ${targetUsername || 'Unknown User'}'s Achievements`,
    thumbnail: { url: avatarURL },
    description: '**Marvel Rivals Ranking System**',
    timestamp: new Date().toISOString(),
    fields: []
  };
  
  const hostRank = ranks.host;
  let hostText = hostRank.current ? `${hostRank.current.emoji} ${hostRank.current.name}${hostRank.next ? `\n${createProgressBar(hostRank.progress, hostRank.next.count)}` : ' ✨'}` : 'Not yet ranked';
  embed.fields.push({ name: '🎮 **HOST RANK**', value: hostText, inline: false });
  
  const recruiterRank = ranks.recruiter;
  let recruiterText = recruiterRank.current ? `${recruiterRank.current.emoji} ${recruiterRank.current.name}${recruiterRank.next ? `\n${createProgressBar(recruiterRank.progress, recruiterRank.next.count)}` : ' ✨'}` : 'Not yet ranked';
  embed.fields.push({ name: '👋 **RECRUITER RANK**', value: recruiterText, inline: false });
  
  const responderRank = ranks.responder;
  let responderText = responderRank.current ? `${responderRank.current.emoji} ${responderRank.current.name}${responderRank.next ? `\n${createProgressBar(responderRank.progress, responderRank.next.count)}` : ' ✨'}` : 'Not yet ranked';
  responderText += `\n━━━━━━━━━━━━━━━━`;
  embed.fields.push({ name: '💬 **RESPONDER RANK**', value: responderText, inline: false });
  
  const statsValue = `${stats.hostsCreated} Hosted • ${stats.invitesSent} Invited • ${stats.rsvpsMade} RSVPs`;
  embed.fields.push({ name: '📊 **STATS**', value: legendaryAchievements.length > 0 ? `${statsValue}\n━━━━━━━━━━━━━━━━` : statsValue, inline: false });
  
  if (legendaryAchievements.length > 0) {
    embed.fields.push({ name: '✨ **LEGENDARY**', value: legendaryAchievements.map(a => `${a.emoji} ${toTitleCase(a.name)}`).join(' • '), inline: false });
  }
  
  return { response: { embeds: [embed], flags: 64 } };
}
