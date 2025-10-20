// Achievement tracking system for Marvel Rivals Bot
let userStats = {};

// Track which users have been credited for which events to prevent farming
// Structure: { eventId: { userId: Set<'rsvp' | 'maybe' | 'fastRSVP'> } }
let eventAchievementCredits = {};

// Track reschedule counts for events
// Structure: { eventId: rescheduleCount }
let eventRescheduleCount = {};

// Initialize user stats if they don't exist
function ensureUser(userId) {
  if (!userStats[userId]) {
    userStats[userId] = {
      hostsCreated: 0,
      invitesSent: 0,
      rsvpsMade: 0,
      maybeCount: 0,
      fastRSVPs: 0,
      worthyEvents: 0,
      noResponseCount: 0,
      recentHostTimestamps: [],
      achievements: []
    };
  }
}

// Check if user has already been credited for this achievement type on this event
function hasBeenCredited(eventId, userId, achievementType) {
  if (!eventAchievementCredits[eventId]) return false;
  if (!eventAchievementCredits[eventId][userId]) return false;
  return eventAchievementCredits[eventId][userId].has(achievementType);
}

// Mark user as credited for this achievement type on this event
function markAsCredited(eventId, userId, achievementType) {
  if (!eventAchievementCredits[eventId]) {
    eventAchievementCredits[eventId] = {};
  }
  if (!eventAchievementCredits[eventId][userId]) {
    eventAchievementCredits[eventId][userId] = new Set();
  }
  eventAchievementCredits[eventId][userId].add(achievementType);
}

// Clean up event tracking when event is deleted/completed
function clearEventCredits(eventId) {
  delete eventAchievementCredits[eventId];
}

// Get user stats
function getUserStats(userId) {
  ensureUser(userId);
  return userStats[userId];
}

// Track when user creates an event
function trackHostCreated(userId) {
  ensureUser(userId);
  userStats[userId].hostsCreated++;
  return checkHostAchievements(userId);
}

// Track when user invites someone
function trackInviteSent(userId, count = 1) {
  ensureUser(userId);
  userStats[userId].invitesSent += count;
  return checkRecruiterAchievements(userId);
}

// Track when user RSVPs to an event
function trackRSVP(userId, eventId = null) {
  // If eventId is provided, check if user has already been credited
  if (eventId && hasBeenCredited(eventId, userId, 'rsvp')) {
    return []; // Already credited for this event
  }
  
  ensureUser(userId);
  userStats[userId].rsvpsMade++;
  
  // Mark as credited for this event
  if (eventId) {
    markAsCredited(eventId, userId, 'rsvp');
  }
  
  return checkResponderAchievements(userId);
}

// Define ranking achievements
const ACHIEVEMENT_TIERS = {
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

// Check and award host achievements
function checkHostAchievements(userId) {
  const stats = getUserStats(userId);
  const newAchievements = [];
  
  for (const tier of ACHIEVEMENT_TIERS.HOST) {
    const achievementId = `HOST_${tier.tier}`;
    if (stats.hostsCreated >= tier.count && !stats.achievements.includes(achievementId)) {
      stats.achievements.push(achievementId);
      newAchievements.push({
        id: achievementId,
        emoji: tier.emoji,
        name: tier.name,
        description: `Host ${tier.count} game${tier.count > 1 ? 's' : ''}`
      });
    }
  }
  
  return newAchievements;
}

// Check and award recruiter achievements
function checkRecruiterAchievements(userId) {
  const stats = getUserStats(userId);
  const newAchievements = [];
  
  for (const tier of ACHIEVEMENT_TIERS.RECRUITER) {
    const achievementId = `RECRUITER_${tier.tier}`;
    if (stats.invitesSent >= tier.count && !stats.achievements.includes(achievementId)) {
      stats.achievements.push(achievementId);
      newAchievements.push({
        id: achievementId,
        emoji: tier.emoji,
        name: tier.name,
        description: `Invite ${tier.count} player${tier.count > 1 ? 's' : ''}`
      });
    }
  }
  
  return newAchievements;
}

// Check and award responder achievements
function checkResponderAchievements(userId) {
  const stats = getUserStats(userId);
  const newAchievements = [];
  
  for (const tier of ACHIEVEMENT_TIERS.RESPONDER) {
    const achievementId = `RESPONDER_${tier.tier}`;
    if (stats.rsvpsMade >= tier.count && !stats.achievements.includes(achievementId)) {
      stats.achievements.push(achievementId);
      newAchievements.push({
        id: achievementId,
        emoji: tier.emoji,
        name: tier.name,
        description: `RSVP to ${tier.count} event${tier.count > 1 ? 's' : ''}`
      });
    }
  }
  
  return newAchievements;
}

// Get user's current rank for each category
function getUserRanks(userId) {
  const stats = getUserStats(userId);
  
  const getHighestRank = (tiers, count) => {
    let currentRank = null;
    let nextRank = tiers[0];
    
    for (let i = 0; i < tiers.length; i++) {
      if (count >= tiers[i].count) {
        currentRank = tiers[i];
        nextRank = tiers[i + 1] || null;
      } else {
        break;
      }
    }
    
    return { current: currentRank, next: nextRank, progress: count };
  };
  
  return {
    host: getHighestRank(ACHIEVEMENT_TIERS.HOST, stats.hostsCreated),
    recruiter: getHighestRank(ACHIEVEMENT_TIERS.RECRUITER, stats.invitesSent),
    responder: getHighestRank(ACHIEVEMENT_TIERS.RESPONDER, stats.rsvpsMade)
  };
}

// Get all achievements for a user
function getUserAchievements(userId) {
  const stats = getUserStats(userId);
  return stats.achievements;
}

// ============================================
// LEGENDARY ACHIEVEMENTS
// ============================================

const LEGENDARY_ACHIEVEMENTS = {
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
  }
};

// Check for Moon Knight achievement (midnight-4am event creation)
function checkMoonKnight(userId, hour) {
  const stats = getUserStats(userId);
  const achievementId = LEGENDARY_ACHIEVEMENTS.MOON_KNIGHT.id;
  
  if ((hour >= 0 && hour < 4) && !stats.achievements.includes(achievementId)) {
    stats.achievements.push(achievementId);
    return [LEGENDARY_ACHIEVEMENTS.MOON_KNIGHT];
  }
  return [];
}

// Check for Wakanda Strategist (20+ days in advance)
function checkWakandaStrategist(userId, daysInAdvance) {
  const stats = getUserStats(userId);
  const achievementId = LEGENDARY_ACHIEVEMENTS.WAKANDA_STRATEGIST.id;
  
  if (daysInAdvance >= 20 && !stats.achievements.includes(achievementId)) {
    stats.achievements.push(achievementId);
    return [LEGENDARY_ACHIEVEMENTS.WAKANDA_STRATEGIST];
  }
  return [];
}

// Track "Maybe" responses
function trackMaybe(userId, eventId = null) {
  // If eventId is provided, check if user has already been credited
  if (eventId && hasBeenCredited(eventId, userId, 'maybe')) {
    return []; // Already credited for this event
  }
  
  ensureUser(userId);
  userStats[userId].maybeCount++;
  
  // Mark as credited for this event
  if (eventId) {
    markAsCredited(eventId, userId, 'maybe');
  }
  
  const stats = getUserStats(userId);
  const achievementId = LEGENDARY_ACHIEVEMENTS.GOD_OF_MISCHIEF.id;
  
  if (stats.maybeCount >= 20 && !stats.achievements.includes(achievementId)) {
    stats.achievements.push(achievementId);
    return [LEGENDARY_ACHIEVEMENTS.GOD_OF_MISCHIEF];
  }
  return [];
}

// Track fast RSVP (within 30 seconds)
function trackFastRSVP(userId, eventId = null) {
  // If eventId is provided, check if user has already been credited
  if (eventId && hasBeenCredited(eventId, userId, 'fastRSVP')) {
    return []; // Already credited for this event
  }
  
  ensureUser(userId);
  userStats[userId].fastRSVPs++;
  
  // Mark as credited for this event
  if (eventId) {
    markAsCredited(eventId, userId, 'fastRSVP');
  }
  
  const stats = getUserStats(userId);
  const achievementId = LEGENDARY_ACHIEVEMENTS.BULLSEYE.id;
  
  if (stats.fastRSVPs >= 1 && !stats.achievements.includes(achievementId)) {
    stats.achievements.push(achievementId);
    return [LEGENDARY_ACHIEVEMENTS.BULLSEYE];
  }
  return [];
}

// Track host frequency (5 events in 7 days)
function trackHostWithTimestamp(userId) {
  ensureUser(userId);
  const now = Date.now();
  const stats = getUserStats(userId);
  
  // Add current timestamp
  stats.recentHostTimestamps.push(now);
  
  // Keep only timestamps from last 7 days
  const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
  stats.recentHostTimestamps = stats.recentHostTimestamps.filter(t => t > sevenDaysAgo);
    
  const achievementId = LEGENDARY_ACHIEVEMENTS.AGAIN_X5.id;
  
  if (stats.recentHostTimestamps.length >= 5 && !stats.achievements.includes(achievementId)) {
    stats.achievements.push(achievementId);
    return [LEGENDARY_ACHIEVEMENTS.AGAIN_X5];
  }
  return [];
}

// Track worthy events (5+ RSVPs)
function trackWorthyEvent(userId) {
  ensureUser(userId);
  userStats[userId].worthyEvents++;
  
  const stats = getUserStats(userId);
  const achievementId = LEGENDARY_ACHIEVEMENTS.WORTHY.id;
  
  if (stats.worthyEvents >= 3 && !stats.achievements.includes(achievementId)) {
    stats.achievements.push(achievementId);
    return [LEGENDARY_ACHIEVEMENTS.WORTHY];
  }
  return [];
}

// Get legendary achievements for a user
function getLegendaryAchievements(userId) {
  const stats = getUserStats(userId);
  return Object.values(LEGENDARY_ACHIEVEMENTS).filter(achievement => 
    stats.achievements.includes(achievement.id)
  );
}

// Track no-response for Cloak's Shadow achievement
function trackNoResponse(userId) {
  ensureUser(userId);
  userStats[userId].noResponseCount++;
  
  const stats = getUserStats(userId);
  const achievementId = LEGENDARY_ACHIEVEMENTS.CLOAKS_SHADOW.id;
  
  if (stats.noResponseCount >= 50 && !stats.achievements.includes(achievementId)) {
    stats.achievements.push(achievementId);
    return [LEGENDARY_ACHIEVEMENTS.CLOAKS_SHADOW];
  }
  return [];
}

// Process event completion and check for non-responders
// This should be called when an event is deleted or expires
function processEventNonResponders(event) {
  if (!event || !event.invited) return [];
  
  const newAchievements = []; // Array of { userId, achievements }
  
  // Get all users who responded to this event
  const responders = new Set();
  if (eventAchievementCredits[event.id]) {
    Object.keys(eventAchievementCredits[event.id]).forEach(userId => {
      responders.add(userId);
    });
  }
  
  // Check each invited user to see if they responded
  event.invited.forEach(userId => {
    // Skip the event creator (they don't need to RSVP to their own event)
    if (userId === event.creatorId) return;
    
    // If user didn't respond, track it
    if (!responders.has(userId)) {
      const achievements = trackNoResponse(userId);
      if (achievements.length > 0) {
        newAchievements.push({ userId, achievements });
      }
    }
  });
  
  return newAchievements;
}

// Track event reschedule and check for Eye of Agamotto achievement
function trackReschedule(userId, oldEventId, newEventId) {
  ensureUser(userId);
  
  // Get the current reschedule count for the old event
  const currentCount = eventRescheduleCount[oldEventId] || 0;
  const newCount = currentCount + 1;
  
  // Store the count for the new event ID
  eventRescheduleCount[newEventId] = newCount;
  
  // Clean up the old event's count
  delete eventRescheduleCount[oldEventId];
  
  // Check if user earned the Eye of Agamotto achievement
  const stats = getUserStats(userId);
  const achievementId = LEGENDARY_ACHIEVEMENTS.EYE_OF_AGAMOTTO.id;
  
  if (newCount >= 3 && !stats.achievements.includes(achievementId)) {
    stats.achievements.push(achievementId);
    return [LEGENDARY_ACHIEVEMENTS.EYE_OF_AGAMOTTO];
  }
  
  return [];
}

module.exports = {
  getUserStats,
  trackHostCreated,
  trackInviteSent,
  trackRSVP,
  getUserRanks,
  getUserAchievements,
  checkMoonKnight,
  checkWakandaStrategist,
  trackMaybe,
  trackFastRSVP,
  trackHostWithTimestamp,
  trackWorthyEvent,
  getLegendaryAchievements,
  clearEventCredits,
  processEventNonResponders,
  trackReschedule,
  ACHIEVEMENT_TIERS,
  LEGENDARY_ACHIEVEMENTS
};

