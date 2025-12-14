import { trackHostCreated, checkMoonKnight, trackHostWithTimestamp } from '../achievementManager.js';

export async function handlePlaynowCommand({
  userId,
  username,
  roleId,
  nextEventId,
  env,
  supabase,
  saveEvent
}) {
  console.log(`[COMMAND] Playnow: userId=${userId}, nextEventId=${nextEventId}`);

  // Build main response
  const rolePing = roleId ? `<@&${roleId}>` : '@rivaling';
  const response = {
    content: `${rolePing} — <@${userId}> needs heroes! **Assemble NOW!**`,
    embeds: [{
      color: 0x00aeff,
      title: '⚡ Avengers assemble!',
      image: { url: 'https://i.imgur.com/pMPmPef.gif' },
      fields: [
        { name: 'Event ID', value: `#${nextEventId}` },
        { name: 'RSVP', value: "👍 I'm coming! | 👎 Can't make it" }
      ]
    }],
    components: [{
      type: 1,
      components: [
        { type: 2, style: 3, label: "I'm coming!", emoji: { name: '👍' }, custom_id: `rsvp_yes_${nextEventId}` },
        { type: 2, style: 4, label: "Can't make it", emoji: { name: '👎' }, custom_id: `rsvp_no_${nextEventId}` }
      ]
    }],
    flags: 0
  };

  // Create & save the new event
  const newEvent = {
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
  };
  console.log(`[COMMAND] Saving new playnow event #${newEvent.id}`);
  await saveEvent(env, newEvent.id.toString(), newEvent);

  // Track achievements internally (won’t generate follow-ups outside)
  try {
    const pstHour = parseInt(
      new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false })
    );
    await trackHostCreated(supabase, userId);
    await checkMoonKnight(supabase, userId, pstHour);
    await trackHostWithTimestamp(supabase, userId);
  } catch (err) {
    console.error('[ACHIEVEMENT] Error tracking achievements:', err);
  }

  // Return single response (no follow-ups)
  return { response };
}