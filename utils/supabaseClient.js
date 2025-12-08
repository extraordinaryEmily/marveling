const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
let supabase = null;

function getSupabaseClient() {
  if (!supabase && process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
    // [SUPABASE] Client initialized (startup)
    //console.log('✅ Supabase client initialized');
  }
  return supabase;
}

// Schedule a reminder in Supabase
async function scheduleReminder(eventId, reminderTime, channelId, attendees) {
  const client = getSupabaseClient();
  if (!client) {
    // [SUPABASE] Not configured warning (called by Create/Reschedule)
    //console.warn('⚠️ Supabase not configured, skipping reminder scheduling');
    return null;
  }

  try {
    const { data, error } = await client
      .from('reminders')
      .insert([
        {
          event_id: eventId.toString(),
          reminder_time: reminderTime, // ISO timestamp
          channel_id: channelId,
          attendees: attendees || [],
          sent: false
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // [SUPABASE] Reminder scheduled (called by Create/Reschedule)
    console.log(`✅ Scheduled reminder in Supabase for event #${eventId} at ${reminderTime}`);
    return data;
  } catch (error) {
    // [SUPABASE] Error scheduling reminder (called by Create/Reschedule)
    //console.error('❌ Error scheduling reminder in Supabase:', error);
    return null;
  }
}

// Cancel a reminder in Supabase
async function cancelReminder(eventId) {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from('reminders')
      .delete()
      .eq('event_id', eventId.toString())
      .eq('sent', false);

    if (error) throw error;

    // [SUPABASE] Reminder cancelled (called by Delete/Reschedule)
    //console.log(`✅ Cancelled reminder in Supabase for event #${eventId}`);
    return true;
  } catch (error) {
    // [SUPABASE] Error cancelling reminder (called by Delete/Reschedule)
    //console.error('❌ Error cancelling reminder in Supabase:', error);
    return false;
  }
}

// Get pending reminders that are due now OR within the next 20 minutes
// We check 20 minutes ahead since cron runs every 20 min (better early than late!)
// Optimized: Only fetch needed fields, not entire table
async function getPendingReminders() {
  const client = getSupabaseClient();
  if (!client) return [];

  try {
    const now = new Date();
    const lookAhead = new Date(now.getTime() + 20 * 60 * 1000); // 20 minutes from now
    
    // Only fetch the fields we actually need (not *)
    const { data, error } = await client
      .from('reminders')
      .select('id, event_id, reminder_time, channel_id, attendees')
      .eq('sent', false)
      .lte('reminder_time', lookAhead.toISOString())
      .order('reminder_time', { ascending: true })
      .limit(50); // Limit to 50 reminders max per check

    if (error) throw error;

    return data || [];
  } catch (error) {
    // Silent fail for cron endpoint
    return [];
  }
}

// Mark reminder as sent (by reminder ID)
async function markReminderSent(reminderId) {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from('reminders')
      .update({ sent: true })
      .eq('id', reminderId);

    if (error) throw error;

    return true;
  } catch (error) {
    // Silent fail for cron endpoint
    return false;
  }
}

// Mark reminder as sent (by event ID) - used by local setTimeout
async function markReminderSentByEventId(eventId) {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from('reminders')
      .update({ sent: true })
      .eq('event_id', eventId.toString())
      .eq('sent', false);

    if (error) throw error;

    // [SUPABASE] Reminder marked as sent (called by local setTimeout)
    //console.log(`✅ Marked reminder as sent in Supabase for event #${eventId}`);
    return true;
  } catch (error) {
    // [SUPABASE] Error marking reminder sent (called by local setTimeout)
    //console.error('❌ Error marking reminder as sent by event ID:', error);
    return false;
  }
}

// Check if reminder was already sent (used by local setTimeout to prevent duplicates)
async function checkIfReminderSent(eventId) {
  const client = getSupabaseClient();
  if (!client) return false; // If no Supabase, assume not sent

  try {
    const { data, error } = await client
      .from('reminders')
      .select('sent')
      .eq('event_id', eventId.toString())
      .single();

    if (error) {
      // If no reminder found, return false (not sent)
      if (error.code === 'PGRST116') return false;
      throw error;
    }

    return data?.sent === true;
  } catch (error) {
    // [SUPABASE] Error checking reminder status (called by local setTimeout)
    //console.error('❌ Error checking if reminder was sent:', error);
    return false; // On error, assume not sent to avoid skipping
  }
}

// Update reminder (for rescheduling)
async function updateReminder(eventId, newReminderTime, newAttendees) {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from('reminders')
      .update({ 
        reminder_time: newReminderTime,
        attendees: newAttendees || []
      })
      .eq('event_id', eventId.toString())
      .eq('sent', false);

    if (error) throw error;

    // [SUPABASE] Reminder updated (called by Reschedule)
    //console.log(`✅ Updated reminder in Supabase for event #${eventId}`);
    return true;
  } catch (error) {
    // [SUPABASE] Error updating reminder (called by Reschedule)
    //console.error('❌ Error updating reminder in Supabase:', error);
    return false;
  }
}

// Cleanup orphaned reminders (reminders for events that no longer exist)
// Conservative approach: Only delete reminders that are:
// 1. Already sent, OR
// 2. Very old (reminder_time > 24 hours ago) AND orphaned
// This prevents deleting valid future reminders on bot restart
async function cleanupOrphanedReminders() {
  const client = getSupabaseClient();
  if (!client) return 0;

  try {
    const { getAllEvents } = require('./eventManager');
    const events = getAllEvents();
    const eventIds = Object.keys(events);

    // Get all reminders with reminder_time to check age
    const { data: allReminders, error } = await client
      .from('reminders')
      .select('id, event_id, reminder_time, sent');

    if (error) throw error;
    if (!allReminders || allReminders.length === 0) return 0;

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

    // Find orphaned reminders that are safe to delete:
    // - Already sent (sent = true), OR
    // - Very old (reminder_time > 24 hours ago) AND orphaned
    const orphanedIds = allReminders
      .filter(reminder => {
        const isOrphaned = !eventIds.includes(reminder.event_id);
        const isSent = reminder.sent === true;
        const reminderTime = new Date(reminder.reminder_time);
        const isVeryOld = reminderTime < oneDayAgo;
        
        // Only delete if: (sent) OR (orphaned AND very old)
        return isSent || (isOrphaned && isVeryOld);
      })
      .map(reminder => reminder.id);

    if (orphanedIds.length === 0) return 0;

    // Delete orphaned reminders
    const { error: deleteError } = await client
      .from('reminders')
      .delete()
      .in('id', orphanedIds);

    if (deleteError) throw deleteError;

    // [SUPABASE] Orphaned reminders cleaned (called on startup)
    //console.log(`🧹 Cleaned up ${orphanedIds.length} orphaned reminder(s) from Supabase`);
    return orphanedIds.length;
  } catch (error) {
    // [SUPABASE] Error cleaning orphaned reminders (called on startup)
    //console.error('❌ Error cleaning up orphaned reminders:', error);
    return 0;
  }
}

module.exports = {
  getSupabaseClient,
  scheduleReminder,
  cancelReminder,
  getPendingReminders,
  markReminderSent,
  markReminderSentByEventId,
  checkIfReminderSent,
  updateReminder,
  cleanupOrphanedReminders
};

