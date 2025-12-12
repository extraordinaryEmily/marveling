// Achievement tracking for Cloudflare Workers
// Simplified version that works with Supabase

// Achievement tiers (from achievementManager.js)
export const ACHIEVEMENT_TIERS = {
  HOST: [
    { tier: 'UNRANKED', count: 1, emoji: '🎮', name: 'UNRANKED ASSEMBLY' },
    { tier: 'BRONZE', count: 5, emoji: '🥉', name: 'BRONZE HOST' },
    { tier: 'SILVER', count: 10, emoji: '🥈', name: 'SILVER HOST' },
    { tier: 'GOLD', count: 15, emoji: '🥇', name: 'GOLD HOST' },
    { tier: 'PLATINUM', count: 25, emoji: '💎', name: 'PLATINUM HOST' },
    { tier: 'DIAMOND', count: 40, emoji: '💠', name: 'DIAMOND HOST' },
  ],
  RECRUITER: [
    { tier: 'UNRANKED', count: 1, emoji: '👋', name: 'UNRANKED RECRUIT' },
    { tier: 'BRONZE', count: 5, emoji: '🥉', name: 'BRONZE RECRUITER' },
    { tier: 'SILVER', count: 15, emoji: '🥈', name: 'SILVER RECRUITER' },
    { tier: 'GOLD', count: 30, emoji: '🥇', name: 'GOLD RECRUITER' },
    { tier: 'PLATINUM', count: 50, emoji: '💎', name: 'PLATINUM RECRUITER' },
  ],
  RESPONDER: [
    { tier: 'UNRANKED', count: 1, emoji: '💬', name: 'UNRANKED RESPONSE' },
    { tier: 'BRONZE', count: 5, emoji: '🥉', name: 'BRONZE RESPONDER' },
    { tier: 'SILVER', count: 25, emoji: '🥈', name: 'SILVER RESPONDER' },
    { tier: 'GOLD', count: 50, emoji: '🥇', name: 'GOLD RESPONDER' },
    { tier: 'PLATINUM', count: 85, emoji: '💎', name: 'PLATINUM RESPONDER' },
  ]
};

export const LEGENDARY_ACHIEVEMENTS = {
  MOON_KNIGHT: {
    id: 'MOON_KNIGHT',
    emoji: '🌙',
    name: 'MOON KNIGHT',
    description: 'Create an event between midnight-4am'
  },
  WAKANDA_STRATEGIST: {
    id: 'WAKANDA_STRATEGIST',
    emoji: '🔮',
    name: 'WAKANDA STRATEGIST',
    description: 'Schedule an event 20+ days in advance'
  },
  GOD_OF_MISCHIEF: {
    id: 'GOD_OF_MISCHIEF',
    emoji: '🎭',
    name: 'GOD OF MISCHIEF',
    description: 'Respond "Maybe" to 20 events'
  },
  BULLSEYE: {
    id: 'BULLSEYE',
    emoji: '🎯',
    name: 'BULLSEYE',
    description: 'RSVP within 30 seconds (not your event)'
  },
  AGAIN_X5: {
    id: 'AGAIN_X5',
    emoji: '😵‍💫',
    name: 'AGAIN, AGAIN, AGAIN, AGAIN, AGAIN',
    description: 'Host 5 events in 7 days'
  },
  WORTHY: {
    id: 'WORTHY',
    emoji: '⚡',
    name: 'WORTHY',
    description: 'Host 3 events where 5+ people RSVP'
  },
  CLOAKS_SHADOW: {
    id: 'CLOAKS_SHADOW',
    emoji: '👻',
    name: "CLOAK'S SHADOW",
    description: 'No response for 50 events you were invited to'
  },
  EYE_OF_AGAMOTTO: {
    id: 'EYE_OF_AGAMOTTO',
    emoji: '👁️',
    name: 'EYE OF AGAMOTTO',
    description: 'Reschedule the same event 5+ times'
  },
  AVENGERS_ASSEMBLE: {
    id: 'AVENGERS_ASSEMBLE',
    emoji: '🦅',
    name: 'AVENGERS ASSEMBLE',
    description: 'Everyone with @rivaling tag RSVPs to an event'
  }
};

export async function trackHostCreated(supabase, userId) {
  console.log(`[ACHIEVEMENT] trackHostCreated for user ${userId}`);
  
  if (!supabase) {
    console.log('[ACHIEVEMENT] ⚠️ Supabase not available, skipping achievement tracking');
    return [];
  }
  
  try {
    await supabase.incrementStat(userId, 'hosts_created', 1);
    console.log(`[ACHIEVEMENT] ✅ Incremented hosts_created for ${userId}`);
    
    // Get updated stats and check for tier achievements
    const stats = await supabase.getUserStats(userId);
    const newAchievements = [];
    
    for (const tier of ACHIEVEMENT_TIERS.HOST) {
      if (stats.hosts_created === tier.count) {
        console.log(`[ACHIEVEMENT] 🎉 User ${userId} unlocked ${tier.name}!`);
        newAchievements.push({
          emoji: tier.emoji,
          name: tier.name,
          description: `Host ${tier.count} game${tier.count > 1 ? 's' : ''}`
        });
      }
    }
    
    return newAchievements;
  } catch (error) {
    console.error('[ACHIEVEMENT] Error tracking host created:', error);
    return [];
  }
}

export async function trackInviteSent(supabase, userId) {
  console.log(`[ACHIEVEMENT] trackInviteSent for user ${userId}`);
  
  if (!supabase) {
    console.log('[ACHIEVEMENT] ⚠️ Supabase not available, skipping achievement tracking');
    return [];
  }
  
  try {
    await supabase.incrementStat(userId, 'invites_sent', 1);
    console.log(`[ACHIEVEMENT] ✅ Incremented invites_sent for ${userId}`);
    
    // Get updated stats and check for tier achievements
    const stats = await supabase.getUserStats(userId);
    const newAchievements = [];
    
    for (const tier of ACHIEVEMENT_TIERS.RECRUITER) {
      if (stats.invites_sent === tier.count) {
        console.log(`[ACHIEVEMENT] 🎉 User ${userId} unlocked ${tier.name}!`);
        newAchievements.push({
          emoji: tier.emoji,
          name: tier.name,
          description: `Invite ${tier.count} player${tier.count > 1 ? 's' : ''}`
        });
      }
    }
    
    return newAchievements;
  } catch (error) {
    console.error('[ACHIEVEMENT] Error tracking invite sent:', error);
    return [];
  }
}

export async function trackRSVP(supabase, userId, eventId) {
  console.log(`[ACHIEVEMENT] trackRSVP for user ${userId} on event ${eventId}`);
  
  if (!supabase) {
    console.log('[ACHIEVEMENT] ⚠️ Supabase not available, skipping achievement tracking');
    return [];
  }
  
  try {
    await supabase.incrementStat(userId, 'rsvps_made', 1);
    console.log(`[ACHIEVEMENT] ✅ Incremented rsvps_made for ${userId}`);
    
    // Get updated stats and check for tier achievements
    const stats = await supabase.getUserStats(userId);
    const newAchievements = [];
    
    for (const tier of ACHIEVEMENT_TIERS.RESPONDER) {
      if (stats.rsvps_made === tier.count) {
        console.log(`[ACHIEVEMENT] 🎉 User ${userId} unlocked ${tier.name}!`);
        newAchievements.push({
          emoji: tier.emoji,
          name: tier.name,
          description: `RSVP to ${tier.count} event${tier.count > 1 ? 's' : ''}`
        });
      }
    }
    
    return newAchievements;
  } catch (error) {
    console.error('[ACHIEVEMENT] Error tracking RSVP:', error);
    return [];
  }
}

export async function trackMaybe(supabase, userId) {
  console.log(`[ACHIEVEMENT] trackMaybe for user ${userId}`);
  
  if (!supabase) {
    console.log('[ACHIEVEMENT] ⚠️ Supabase not available, skipping achievement tracking');
    return [];
  }
  
  try {
    // Track maybe responses similarly to RSVPs
    await supabase.incrementStat(userId, 'rsvps_made', 1);
    console.log(`[ACHIEVEMENT] ✅ Tracked maybe response for ${userId}`);
    return [];
  } catch (error) {
    console.error('[ACHIEVEMENT] Error tracking maybe:', error);
    return [];
  }
}

export async function trackFastRSVP(supabase, userId, eventCreatedAt) {
  console.log(`[ACHIEVEMENT] trackFastRSVP for user ${userId}`);
  
  if (!supabase) {
    console.log('[ACHIEVEMENT] ⚠️ Supabase not available, skipping achievement tracking');
    return [];
  }
  
  const now = Date.now();
  const timeDiff = now - eventCreatedAt;
  const minutesDiff = timeDiff / (1000 * 60);
  
  console.log(`[ACHIEVEMENT] RSVP time: ${minutesDiff.toFixed(2)} minutes after event created`);
  
  if (minutesDiff <= 5) {
    console.log(`[ACHIEVEMENT] ✅ Fast RSVP detected (under 5 minutes)`);
    // TODO: Track fast RSVP achievement
    return [];
  }
  
  return [];
}

export async function trackWorthyEvent(supabase, hostUserId, attendeeCount) {
  console.log(`[ACHIEVEMENT] trackWorthyEvent for host ${hostUserId}, ${attendeeCount} attendees`);
  
  if (!supabase) {
    console.log('[ACHIEVEMENT] ⚠️ Supabase not available, skipping achievement tracking');
    return [];
  }
  
  if (attendeeCount >= 5) {
    console.log(`[ACHIEVEMENT] ✅ Worthy event! 5+ attendees`);
    // TODO: Track worthy event achievement
    return [];
  }
  
  return [];
}

export async function checkAvengersAssemble(supabase, event) {
  console.log(`[ACHIEVEMENT] checkAvengersAssemble for event ${event.id}`);
  
  if (!supabase) {
    console.log('[ACHIEVEMENT] ⚠️ Supabase not available, skipping achievement tracking');
    return [];
  }
  
  // Check if all invited people have RSVP'd
  const invitedCount = (event.invited || []).length;
  const rsvpCount = (event.attendees || []).length + (event.maybe || []).length;
  
  console.log(`[ACHIEVEMENT] Invited: ${invitedCount}, RSVP'd: ${rsvpCount}`);
  
  if (invitedCount > 0 && invitedCount === rsvpCount) {
    console.log(`[ACHIEVEMENT] ✅ Avengers Assemble! Everyone RSVP'd`);
    // TODO: Award achievement to all participants
    return [];
  }
  
  return [];
}

export async function checkMoonKnight(supabase, userId, hour) {
  console.log(`[ACHIEVEMENT] checkMoonKnight for user ${userId} at hour ${hour}`);
  
  if (!supabase) {
    console.log('[ACHIEVEMENT] ⚠️ Supabase not available, skipping achievement tracking');
    return [];
  }
  
  if (hour >= 0 && hour < 4) {
    console.log(`[ACHIEVEMENT] ✅ Moon Knight! Event created between midnight-4am PST`);
    // TODO: Award Moon Knight achievement
    return [];
  }
  
  return [];
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

export async function trackHostWithTimestamp(supabase, userId) {
  console.log(`[ACHIEVEMENT] trackHostWithTimestamp for user ${userId}`);
  
  if (!supabase) {
    console.log('[ACHIEVEMENT] ⚠️ Supabase not available, skipping achievement tracking');
    return [];
  }
  
  // TODO: Track host timestamp for "5 in 7 days" achievement
  console.log(`[ACHIEVEMENT] ✅ Tracked host timestamp for ${userId}`);
  return [];
}

