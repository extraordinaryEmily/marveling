// Command state manager - Simplified for button-based interactions
// No longer needed for gateway-free bot, but keeping stub for compatibility

const userCommandStates = new Map();

/**
 * Register a command state for a user (stub - not used in button-based flow)
 */
function registerCommandState(userId, commandName, collectors = {}, cleanupCallback = null) {
  userCommandStates.set(userId, {
    commandName,
    collectors,
    cleanupCallback,
    timestamp: Date.now()
  });
}

/**
 * Cancel a user's active command (stub - not used in button-based flow)
 */
function cancelUserCommand(userId, reason = 'new_command') {
  const state = userCommandStates.get(userId);
  if (!state) return false;
  
  userCommandStates.delete(userId);
  return true;
}

/**
 * Mark a user's command as completed (stub - not used in button-based flow)
 */
function completeUserCommand(userId) {
  const state = userCommandStates.get(userId);
  if (state) {
    userCommandStates.delete(userId);
    return true;
  }
  return false;
}

/**
 * Get a user's command state (stub - not used in button-based flow)
 */
function getUserCommandState(userId) {
  return userCommandStates.get(userId) || null;
}

/**
 * Clean up stale command states (stub - not used in button-based flow)
 */
function cleanupStaleStates() {
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
  for (const [userId, state] of userCommandStates.entries()) {
    if (state.timestamp < fiveMinutesAgo) {
      userCommandStates.delete(userId);
    }
  }
}

module.exports = {
  registerCommandState,
  cancelUserCommand,
  completeUserCommand,
  getUserCommandState,
  cleanupStaleStates
};
