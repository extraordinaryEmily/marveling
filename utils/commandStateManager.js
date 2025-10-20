// Track active command states for each user
// This prevents issues when users start new commands before finishing old ones

const userCommandStates = new Map();

/**
 * Register a new command state for a user
 * Automatically cancels any previous command state for that user
 * 
 * @param {string} userId - Discord user ID
 * @param {string} commandName - Name of the command (e.g., 'create', 'reschedule')
 * @param {Object} collectors - Object containing collectors to cancel later { button: collector, message: collector }
 * @param {Function} cleanupCallback - Optional callback to run when cancelling
 */
function registerCommandState(userId, commandName, collectors = {}, cleanupCallback = null) {
  // Cancel any existing command state for this user
  cancelUserCommand(userId);
  
  // Store the new command state
  userCommandStates.set(userId, {
    commandName,
    collectors,
    cleanupCallback,
    timestamp: Date.now()
  });
  
  console.log(`[CommandState] User ${userId} started: ${commandName}`);
}

/**
 * Cancel and cleanup a user's active command
 * 
 * @param {string} userId - Discord user ID
 * @param {string} reason - Reason for cancellation (e.g., 'new_command', 'completed', 'timeout')
 */
function cancelUserCommand(userId, reason = 'new_command') {
  const state = userCommandStates.get(userId);
  
  if (!state) return false;
  
  console.log(`[CommandState] Cancelling ${state.commandName} for user ${userId} (reason: ${reason})`);
  
  // Stop all collectors
  if (state.collectors) {
    Object.entries(state.collectors).forEach(([type, collector]) => {
      if (collector && typeof collector.stop === 'function') {
        try {
          collector.stop(reason);
        } catch (error) {
          console.error(`Error stopping ${type} collector:`, error);
        }
      }
    });
  }
  
  // Run cleanup callback if provided
  if (state.cleanupCallback && typeof state.cleanupCallback === 'function') {
    try {
      state.cleanupCallback(reason);
    } catch (error) {
      console.error('Error in cleanup callback:', error);
    }
  }
  
  // Remove from tracking
  userCommandStates.delete(userId);
  
  return true;
}

/**
 * Mark a user's command as completed (removes from tracking without stopping collectors)
 * 
 * @param {string} userId - Discord user ID
 */
function completeUserCommand(userId) {
  const state = userCommandStates.get(userId);
  if (state) {
    console.log(`[CommandState] User ${userId} completed: ${state.commandName}`);
    userCommandStates.delete(userId);
    return true;
  }
  return false;
}

/**
 * Check if a user has an active command
 * 
 * @param {string} userId - Discord user ID
 * @returns {Object|null} Command state or null
 */
function getUserCommandState(userId) {
  return userCommandStates.get(userId) || null;
}

/**
 * Clean up stale command states (older than 5 minutes)
 * Should be called periodically
 */
function cleanupStaleStates() {
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
  let cleaned = 0;
  
  for (const [userId, state] of userCommandStates.entries()) {
    if (state.timestamp < fiveMinutesAgo) {
      cancelUserCommand(userId, 'stale');
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[CommandState] Cleaned up ${cleaned} stale command state(s)`);
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupStaleStates, 5 * 60 * 1000);

module.exports = {
  registerCommandState,
  cancelUserCommand,
  completeUserCommand,
  getUserCommandState,
  cleanupStaleStates
};

