export async function handleRescheduleCommand(interaction, events, supabase, env) {
    const applicationId = interaction.application_id;
    const token = interaction.token;
  
    // ===== 1. Extract incoming values =====
    const eventId =
      interaction.data.options?.find(o => o.name === 'id')?.value?.replace('#', '');
  
    const newTime =
      interaction.data.options?.find(o => o.name === 'time')?.value;
  
    const userId =
      interaction.member?.user?.id ||
      interaction.user?.id;
  
    const roleId =
      interaction.data.options?.find(o => o.name === 'role')?.value || null;
  
    const channelId = interaction.channel_id;
  
    // The next sequential event ID (passed from worker)
    const nextEventId =
      interaction.data.options?.find(o => o.name === 'next')?.value ||
      Date.now(); // fallback
  
    console.log(`[COMMAND] Reschedule: eventId=${eventId}, newTime=${newTime}, nextEventId=${nextEventId}`);
  
    // ===== 2. Validate event =====
    const event = events[eventId];
  
    if (!event)
      return { response: { content: `❌ Event #${eventId} not found.`, flags: 64 } };
  
    if (event.type !== 'planned')
      return { response: { content: `❌ You cannot reschedule "Play Now" sessions.`, flags: 64 } };
  
    if (userId !== event.creatorId)
      return { response: { content: `🚫 Only the host can reschedule this event.`, flags: 64 } };
  
    if (!newTime || newTime.trim().length === 0)
      return {
        response: {
          content: `❌ "${newTime}" is not valid. Try "Oct 18 5PM" or "Friday 8PM". All times are PST.`,
          flags: 64
        }
      };
  
    // ===== 3. Build new response =====
    const rolePing = roleId ? `<@&${roleId}>` : '@rivaling';
    const oldInvited = [...(event.invited || [])];
  
    const baseResponse = {
      content: `🔁 <@${userId}> rescheduled event #${eventId}!\n🗓 New Time: ${newTime} (PST)\n${rolePing}`,
      embeds: [{
        color: 0x00ff88,
        title: '🔁 Marvel Rivals Game Night (Rescheduled)',
        fields: [
          { name: 'Event ID', value: `#${nextEventId}` },
          { name: 'RSVP', value: "✅ Available | 🤔 Maybe | ⛔ Can't make it | 🔁 Reschedule" }
        ]
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
    };
  
    // ===== 4. Delete old event =====
    console.log(`[COMMAND] Deleting old event #${eventId}`);
    await deleteEventFromKV(env, eventId);
  
    // ===== 5. Cancel old reminder =====
    if (supabase) {
      try {
        console.log(`[COMMAND] Canceling old reminder for event #${eventId}`);
        await supabase.cancelReminder(eventId);
      } catch (err) {
        console.error(`[COMMAND] Failed to cancel old reminder:`, err);
      }
    }
  
    // ===== 6. Build new event =====
    const newEvent = {
      id: nextEventId,
      creatorId: userId,
      type: 'planned',
      time: newTime,
      invited: oldInvited,
      attendees: [],
      maybe: [],
      guests: [],
      createdAt: Date.now(),
      channelId,
      eventTimeIso: null,
      reminderTime: null
    };
  
    console.log(`[COMMAND] Saving new rescheduled event #${nextEventId}`);
    await saveEvent(env, nextEventId.toString(), newEvent);
  
    // ===== 7. Schedule new reminder (if we can parse it) =====
    let reminderData = null;
  
    try {
      // Optional: parse newTime → ISO
      // You may already have a parser function
      const reminderIso = null;
  
      if (reminderIso) {
        reminderData = {
          eventId: nextEventId,
          reminderTime: reminderIso,
          channelId,
          attendees: []
        };
  
        if (supabase) {
          console.log(`[COMMAND] Scheduling new reminder for event #${nextEventId}`);
          await supabase.scheduleReminder(
            reminderData.eventId,
            reminderData.reminderTime,
            reminderData.channelId,
            reminderData.attendees
          );
        }
      }
    } catch (err) {
      console.error(`[COMMAND] Failed to schedule reminder:`, err);
    }
  
    // ===== 8. Final return object =====
    return {
      response: baseResponse,
      newEvent,
      reminderData,
      followUps: []
    };
  }