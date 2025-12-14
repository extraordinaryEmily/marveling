import { trackHostCreated, checkMoonKnight, checkWakandaStrategist, trackHostWithTimestamp } from '../achievementManager.js';
export async function handlePlanCommand(
    interaction,
    userId,
    nextEventId,
    roleId,
    channelId,
    env,
    supabase,
    saveEvent,
    sendFollowUp,
    applicationId,
    token
  ) {
    // ===== 1. Extract time string =====
    const time = interaction.data.options?.find(opt => opt.name === 'time')?.value;
  
    if (!time) {
      return { content: '❌ Time is required.', flags: 64 };
    }
  
    console.log(`[COMMAND] Plan: userId=${userId}, time=${time}, nextEventId=${nextEventId}`);
  
    // ===== 2. TODO: Parse time string into ISO timestamps =====
    // For now, keep these null as before
    const eventTimeIso = null;
    const reminderTimeIso = null;
  
    // ===== 3. Build base response/embed (your original logic) =====
    const rolePing = roleId ? `<@&${roleId}>` : '@rivaling';
  
    const response = {
      content: `${rolePing} — <@${userId}> is planning a game night!\n🗓 **Time:** ${time} (PST)`,
      embeds: [{
        color: 0xff0000,
        title: '📅 Marvel Rivals Game Night',
        fields: [
          { name: 'Event ID', value: `#${nextEventId}` },
          { name: 'RSVP', value: "👍 Available | 🤔 Maybe | 👎 Can't make it | 🔁 Reschedule" }
        ]
      }],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 3, label: 'Available', emoji: { name: '👍' }, custom_id: `rsvp_yes_${nextEventId}` },
          { type: 2, style: 2, label: 'Maybe',    emoji: { name: '🤔' }, custom_id: `rsvp_maybe_${nextEventId}` },
          { type: 2, style: 4, label: "Can't make it", emoji: { name: '👎' }, custom_id: `rsvp_no_${nextEventId}` },
          { type: 2, style: 1, label: 'Reschedule',   emoji: { name: '🔁' }, custom_id: `rsvp_reschedule_${nextEventId}` }
        ]
      }],
      flags: 0
    };
  
    // ===== 4. Build new event =====
    const newEvent = {
      id: nextEventId,
      creatorId: userId,
      type: 'planned',
      time,
      invited: [userId],
      attendees: [],
      maybe: [],
      guests: [],
      createdAt: Date.now(),
      channelId,
      eventTimeIso,
      reminderTime: reminderTimeIso
    };
  
    // ===== 5. Save the new event =====
    console.log(`[COMMAND] Saving new plan event #${nextEventId}`);
    await saveEvent(env, nextEventId.toString(), newEvent);
  
    // -----------------------------------------------------------
    // 6. Handle ALL achievement tracking inside the handler
    // -----------------------------------------------------------
  
    console.log(`[COMMAND] Tracking host achievements for ${userId}`);
    const hostAchievements = await trackHostCreated(supabase, userId);
  
    // Moon Knight (late hours)
    const pstHour = parseInt(new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      hour12: false
    }));
    const moonKnightAchievements = await checkMoonKnight(supabase, userId, pstHour);
  
    // Wakanda Strategist — planned 3+ days early
    let strategistAchievements = [];
    if (eventTimeIso) {
      const eventTime = new Date(eventTimeIso);
      const daysInAdvance = (eventTime - Date.now()) / (1000 * 60 * 60 * 24);
      console.log(`[COMMAND] Event planned ${daysInAdvance.toFixed(2)} days in advance`);
      strategistAchievements = await checkWakandaStrategist(supabase, userId, daysInAdvance);
    }
  
    // Timestamp-based host achievement
    const timestampAchievements = await trackHostWithTimestamp(supabase, userId);
  
    // Combine all
    const allAchievements = [
      ...hostAchievements,
      ...moonKnightAchievements,
      ...strategistAchievements,
      ...timestampAchievements
    ];
  
    // ===== 7. Send achievement announcements =====
    if (allAchievements.length > 0) {
      const achievementText = allAchievements
        .map(a => `<@${userId}> unlocked ${a.emoji} **${a.name}**!`)
        .join('\n');
  
      console.log(`[COMMAND] Sending achievement announcement:`, achievementText);
      await sendFollowUp(applicationId, token, { content: achievementText });
    }
  
    // ===== 8. Schedule reminder (if parsed time exists) =====
    if (reminderTimeIso && supabase) {
      console.log(`[COMMAND] Scheduling reminder for event #${nextEventId}`);
      try {
        await supabase.scheduleReminder(
          nextEventId,
          reminderTimeIso,
          channelId,
          []
        );
      } catch (err) {
        console.error('[COMMAND] Failed to schedule reminder:', err);
      }
    }
  
    // ===== 9. (Future) Follow-ups (empty for now)
    const followUps = [];
  
    for (const followUp of followUps) {
      await sendFollowUp(applicationId, token, followUp);
    }
  
    // ===== 10. Return the final Discord response =====
    return response;
  }