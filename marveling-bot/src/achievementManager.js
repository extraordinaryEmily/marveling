// Achievement tracking for Cloudflare Workers with full features
// Works with Supabase, supports legendary achievements, event tracking, and tiers

export const ACHIEVEMENT_TIERS = {
  HOST: [
    { tier: 'UNRANKED', count: 1, emoji: '🎮', name: 'UNRANKED ASSEMBLY' },
    { tier: 'BRONZE', count: 5, emoji: '🥉', name: 'BRONZE HOST' },
    { tier: 'SILVER', count: 10, emoji: '🥈', name: 'SILVER HOST' },
    { tier: 'GOLD', count: 15, emoji: '🥇', name: 'GOLD HOST' },
    { tier: 'PLATINUM', count: 25, emoji: '💎', name: 'PLATINUM HOST' },
    { tier: 'DIAMOND', count: 40, emoji: '💠', name: 'DIAMOND HOST' },
    { tier: 'GRANDMASTER', count: 60, emoji: '⭐', name: 'GRANDMASTER HOST' },
    { tier: 'CELESTIAL', count: 85, emoji: '🌟', name: 'CELESTIAL HOST' },
    { tier: 'ETERNITY', count: 120, emoji: '♾️', name: 'ETERNITY HOST' },
    { tier: 'ONE_ABOVE_ALL', count: 200, emoji: '👁️', name: 'ONE ABOVE ALL HOST' }
  ],
  RECRUITER: [
    { tier: 'UNRANKED', count: 1, emoji: '👋', name: 'UNRANKED RECRUIT' },
    { tier: 'BRONZE', count: 5, emoji: '🥉', name: 'BRONZE RECRUITER' },
    { tier: 'SILVER', count: 15, emoji: '🥈', name: 'SILVER RECRUITER' },
    { tier: 'GOLD', count: 30, emoji: '🥇', name: 'GOLD RECRUITER' },
    { tier: 'PLATINUM', count: 50, emoji: '💎', name: 'PLATINUM RECRUITER' },
    { tier: 'DIAMOND', count: 80, emoji: '💠', name: 'DIAMOND RECRUITER' },
    { tier: 'GRANDMASTER', count: 120, emoji: '⭐', name: 'GRANDMASTER RECRUITER' },
    { tier: 'CELESTIAL', count: 170, emoji: '🌟', name: 'CELESTIAL RECRUITER' },
    { tier: 'ETERNITY', count: 240, emoji: '♾️', name: 'ETERNITY RECRUITER' },
    { tier: 'ONE_ABOVE_ALL', count: 400, emoji: '👁️', name: 'ONE ABOVE ALL RECRUITER' }
  ],
  RESPONDER: [
    { tier: 'UNRANKED', count: 1, emoji: '💬', name: 'UNRANKED RESPONSE' },
    { tier: 'BRONZE', count: 5, emoji: '🥉', name: 'BRONZE RESPONDER' },
    { tier: 'SILVER', count: 25, emoji: '🥈', name: 'SILVER RESPONDER' },
    { tier: 'GOLD', count: 50, emoji: '🥇', name: 'GOLD RESPONDER' },
    { tier: 'PLATINUM', count: 85, emoji: '💎', name: 'PLATINUM RESPONDER' },
    { tier: 'DIAMOND', count: 130, emoji: '💠', name: 'DIAMOND RESPONDER' },
    { tier: 'GRANDMASTER', count: 190, emoji: '⭐', name: 'GRANDMASTER RESPONDER' },
    { tier: 'CELESTIAL', count: 270, emoji: '🌟', name: 'CELESTIAL RESPONDER' },
    { tier: 'ETERNITY', count: 380, emoji: '♾️', name: 'ETERNITY RESPONDER' },
    { tier: 'ONE_ABOVE_ALL', count: 600, emoji: '👁️', name: 'ONE ABOVE ALL RESPONDER' }
  ]
};

export const LEGENDARY_ACHIEVEMENTS = {
  MOON_KNIGHT: { id: 'MOON_KNIGHT', emoji: '🌙', name: 'MOON KNIGHT', description: 'Create an event between midnight-4am' },
  WAKANDA_STRATEGIST: { id: 'WAKANDA_STRATEGIST', emoji: '🔮', name: 'WAKANDA STRATEGIST', description: 'Schedule an event 20+ days in advance' },
  GOD_OF_MISCHIEF: { id: 'GOD_OF_MISCHIEF', emoji: '🎭', name: 'GOD OF MISCHIEF', description: 'Respond "Maybe" to 20 events' },
  BULLSEYE: { id: 'BULLSEYE', emoji: '🎯', name: 'BULLSEYE', description: 'RSVP within 30 seconds (not your event)' },
  AGAIN_X5: { id: 'AGAIN_X5', emoji: '😵‍💫', name: 'AGAIN, AGAIN, AGAIN, AGAIN, AGAIN', description: 'Host 5 events in 7 days' },
  WORTHY: { id: 'WORTHY', emoji: '⚡', name: 'WORTHY', description: 'Host 3 events where 5+ people RSVP' },
  CLOAKS_SHADOW: { id: 'CLOAKS_SHADOW', emoji: '👻', name: "CLOAK'S SHADOW", description: 'No response for 50 events you were invited to' },
  EYE_OF_AGAMOTTO: { id: 'EYE_OF_AGAMOTTO', emoji: '👁️', name: 'EYE OF AGAMOTTO', description: 'Reschedule the same event 5+ times' },
  AVENGERS_ASSEMBLE: { id: 'AVENGERS_ASSEMBLE', emoji: '🦅', name: 'AVENGERS ASSEMBLE', description: 'Everyone with @rivaling tag RSVPs to an event' }
};

// ============================================
// Core helper functions
// ============================================

async function ensureUserStats(supabase, userId) {
  if (!supabase) return null;
  let stats = await supabase.getUserStatsFromSupabase(userId);
  if (!stats) {
    stats = {
      hosts_created: 0,
      invites_sent: 0,
      rsvps_made: 0,
      maybe_count: 0,
      fast_rsvps: 0,
      worthy_events: 0,
      no_response_count: 0,
      recent_host_timestamps: [],
      achievements: []
    };
    await supabase.updateUserStatsInSupabase(userId, stats);
  }
  return stats;
}

function checkTierAchievements(stats, category, tiers) {
  const newAchievements = [];
  const countKey = {
    HOST: 'hosts_created',
    RECRUITER: 'invites_sent',
    RESPONDER: 'rsvps_made'
  }[category];
  
  const count = stats[countKey] || 0;
  
  for (const tier of tiers) {
    const achievementId = `${category}_${tier.tier}`;
    if (count >= tier.count && !stats.achievements.includes(achievementId)) {
      stats.achievements.push(achievementId);
      newAchievements.push({
        id: achievementId,
        emoji: tier.emoji,
        name: tier.name,
        description: `${category === 'RECRUITER' ? 'Invite' : category === 'RESPONDER' ? 'RSVP to' : 'Host'} ${tier.count} ${category === 'RECRUITER' ? 'player' : 'game'}${tier.count > 1 ? 's' : ''}`
      });
    }
  }
  
  return newAchievements;
}

// ============================================
// Achievement trackers
// ============================================

export async function trackHostCreated(supabase, userId) {
  const stats = await ensureUserStats(supabase, userId);
  if (!stats) return [];
  
  stats.hosts_created++;
  const newAchievements = checkTierAchievements(stats, 'HOST', ACHIEVEMENT_TIERS.HOST);
  await supabase.updateUserStatsInSupabase(userId, stats);
  return newAchievements;
}

export async function trackInviteSent(supabase, userId, count = 1) {
  const stats = await ensureUserStats(supabase, userId);
  if (!stats) return [];
  
  stats.invites_sent += count;
  const newAchievements = checkTierAchievements(stats, 'RECRUITER', ACHIEVEMENT_TIERS.RECRUITER);
  await supabase.updateUserStatsInSupabase(userId, stats);
  return newAchievements;
}

export async function trackRSVP(supabase, userId, eventId = null) {
  const stats = await ensureUserStats(supabase, userId);
  if (!stats) return [];
  
  if (eventId && await supabase.checkEventAchievementCredit(eventId, userId, 'rsvp')) {
    return [];
  }
  
  stats.rsvps_made++;
  if (eventId) await supabase.markEventAchievementCredit(eventId, userId, 'rsvp');
  
  const newAchievements = checkTierAchievements(stats, 'RESPONDER', ACHIEVEMENT_TIERS.RESPONDER);
  await supabase.updateUserStatsInSupabase(userId, stats);
  return newAchievements;
}

// Legendary achievement examples
export async function checkMoonKnight(supabase, userId, hour) {
  const stats = await ensureUserStats(supabase, userId);
  if (!stats) return [];
  
  const achievementId = LEGENDARY_ACHIEVEMENTS.MOON_KNIGHT.id;
  if (hour >= 0 && hour < 4 && !stats.achievements.includes(achievementId)) {
    stats.achievements.push(achievementId);
    await supabase.updateUserStatsInSupabase(userId, stats);
    return [LEGENDARY_ACHIEVEMENTS.MOON_KNIGHT];
  }
  
  return [];
}

// Track fast RSVP
export async function trackFastRSVP(supabase, userId, eventCreatedAt) {
  const stats = await ensureUserStats(supabase, userId);
  if (!stats) return [];
  
  const timeDiff = Date.now() - eventCreatedAt;
  if (timeDiff <= 30 * 1000) { // 30 seconds
    const achievementId = LEGENDARY_ACHIEVEMENTS.BULLSEYE.id;
    if (!stats.achievements.includes(achievementId)) {
      stats.achievements.push(achievementId);
      await supabase.updateUserStatsInSupabase(userId, stats);
      return [LEGENDARY_ACHIEVEMENTS.BULLSEYE];
    }
  }
  await supabase.updateUserStatsInSupabase(userId, stats);
  return [];
}

// Track "maybe" responses
export async function trackMaybe(supabase, userId, eventId = null) {
  const stats = await ensureUserStats(supabase, userId);
  if (!stats) return [];
  
  if (eventId && await supabase.checkEventAchievementCredit(eventId, userId, 'maybe')) return [];
  stats.maybe_count++;
  if (eventId) await supabase.markEventAchievementCredit(eventId, userId, 'maybe');
  
  const achievementId = LEGENDARY_ACHIEVEMENTS.GOD_OF_MISCHIEF.id;
  if (stats.maybe_count >= 20 && !stats.achievements.includes(achievementId)) {
    stats.achievements.push(achievementId);
    await supabase.updateUserStatsInSupabase(userId, stats);
    return [LEGENDARY_ACHIEVEMENTS.GOD_OF_MISCHIEF];
  }
  
  await supabase.updateUserStatsInSupabase(userId, stats);
  return [];
}

// Track host timestamps for "5 in 7 days" legendary
export async function trackHostWithTimestamp(supabase, userId) {
  const stats = await ensureUserStats(supabase, userId);
  if (!stats) return [];
  
  const now = Date.now();
  stats.recent_host_timestamps = (stats.recent_host_timestamps || []).filter(t => t > now - 7*24*60*60*1000);
  stats.recent_host_timestamps.push(now);
  
  const achievementId = LEGENDARY_ACHIEVEMENTS.AGAIN_X5.id;
  if (stats.recent_host_timestamps.length >= 5 && !stats.achievements.includes(achievementId)) {
    stats.achievements.push(achievementId);
    await supabase.updateUserStatsInSupabase(userId, stats);
    return [LEGENDARY_ACHIEVEMENTS.AGAIN_X5];
  }
  
  await supabase.updateUserStatsInSupabase(userId, stats);
  return [];
}

// Track worthy events (5+ attendees)
export async function trackWorthyEvent(supabase, userId, attendeeCount) {
  if (attendeeCount < 5) return [];
  const stats = await ensureUserStats(supabase, userId);
  if (!stats) return [];
  
  stats.worthy_events++;
  const achievementId = LEGENDARY_ACHIEVEMENTS.WORTHY.id;
  if (stats.worthy_events >= 3 && !stats.achievements.includes(achievementId)) {
    stats.achievements.push(achievementId);
    await supabase.updateUserStatsInSupabase(userId, stats);
    return [LEGENDARY_ACHIEVEMENTS.WORTHY];
  }
  
  await supabase.updateUserStatsInSupabase(userId, stats);
  return [];
}

// Track no-response achievement (Cloak's Shadow)
export async function trackNoResponse(supabase, userId) {
  const stats = await ensureUserStats(supabase, userId);
  if (!stats) return [];
  
  stats.no_response_count++;
  const achievementId = LEGENDARY_ACHIEVEMENTS.CLOAKS_SHADOW.id;
  if (stats.no_response_count >= 50 && !stats.achievements.includes(achievementId)) {
    stats.achievements.push(achievementId);
    await supabase.updateUserStatsInSupabase(userId, stats);
    return [LEGENDARY_ACHIEVEMENTS.CLOAKS_SHADOW];
  }
  
  await supabase.updateUserStatsInSupabase(userId, stats);
  return [];
}

// Track reschedules (Eye of Agamotto)
export async function trackReschedule(supabase, userId, oldEventId, newEventId) {
  const count = await supabase.getEventRescheduleCountFromSupabase(oldEventId) || 0;
  const newCount = count + 1;
  await supabase.updateEventRescheduleCountInSupabase(newEventId, newCount);
  await supabase.clearEventRescheduleCountFromSupabase(oldEventId);
  
  const stats = await ensureUserStats(supabase, userId);
  const achievementId = LEGENDARY_ACHIEVEMENTS.EYE_OF_AGAMOTTO.id;
  
  if (newCount >= 5 && !stats.achievements.includes(achievementId)) {
    stats.achievements.push(achievementId);
    await supabase.updateUserStatsInSupabase(userId, stats);
    return [LEGENDARY_ACHIEVEMENTS.EYE_OF_AGAMOTTO];
  }
  return [];
}

// Check Avengers Assemble achievement
export async function checkAvengersAssemble(supabase, event) {
  if (!event || !event.invited || !event.attendees) return [];
  
  const nonCreatorInvited = event.invited.filter(id => id !== event.creatorId);
  if (!nonCreatorInvited.every(id => event.attendees.includes(id))) return [];
  if (!event.attendees.includes(event.creatorId)) return [];
  
  const newAchievements = [];
  for (const userId of event.attendees) {
    const stats = await ensureUserStats(supabase, userId);
    const achievementId = LEGENDARY_ACHIEVEMENTS.AVENGERS_ASSEMBLE.id;
    if (!stats.achievements.includes(achievementId)) {
      stats.achievements.push(achievementId);
      await supabase.updateUserStatsInSupabase(userId, stats);
      newAchievements.push({ userId, achievements: [LEGENDARY_ACHIEVEMENTS.AVENGERS_ASSEMBLE] });
    }
  }
  return newAchievements;
}

export async function checkWakandaStrategist(supabase, userId, daysInAdvance) {
  console.log(`[ACHIEVEMENT] checkWakandaStrategist for user ${userId}, ${daysInAdvance.toFixed(2)} days in advance`);
  
  if (!supabase) {
    console.log('[ACHIEVEMENT] ⚠️ Supabase not available, skipping achievement tracking');
    return [];
  }
  
  if (daysInAdvance >= 3) {
    console.log(`[ACHIEVEMENT] ✅ Wakanda Strategist! Event planned 3+ days in advance`);
    // TODO: Award Wakanda Strategist achievement
    return [];
  }
  
  return [];
}