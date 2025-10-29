const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
let supabase = null;

function getSupabaseClient() {
  if (!supabase && process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
    console.log('✅ Supabase client initialized');
  }
  return supabase;
}

// Schedule a reminder in Supabase
async function scheduleReminder(eventId, reminderTime, channelId, attendees) {
  const client = getSupabaseClient();
  if (!client) {
    console.warn('⚠️ Supabase not configured, skipping reminder scheduling');
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

    console.log(`✅ Scheduled reminder in Supabase for event #${eventId} at ${reminderTime}`);
    return data;
  } catch (error) {
    console.error('❌ Error scheduling reminder in Supabase:', error);
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

    console.log(`✅ Cancelled reminder in Supabase for event #${eventId}`);
    return true;
  } catch (error) {
    console.error('❌ Error cancelling reminder in Supabase:', error);
    return false;
  }
}

// Get pending reminders that are due now OR within the next 20 minutes
// We check 20 minutes ahead since cron runs every 20 min (better early than late!)
async function getPendingReminders() {
  const client = getSupabaseClient();
  if (!client) return [];

  try {
    const now = new Date();
    const lookAhead = new Date(now.getTime() + 20 * 60 * 1000); // 20 minutes from now
    
    const { data, error } = await client
      .from('reminders')
      .select('*')
      .eq('sent', false)
      .lte('reminder_time', lookAhead.toISOString())
      .order('reminder_time', { ascending: true });

    if (error) throw error;

    console.log(`📋 Found ${data?.length || 0} reminder(s) due by ${lookAhead.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' })} PST`);
    return data || [];
  } catch (error) {
    console.error('❌ Error fetching pending reminders:', error);
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
    console.error('❌ Error marking reminder as sent:', error);
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

    console.log(`✅ Marked reminder as sent in Supabase for event #${eventId}`);
    return true;
  } catch (error) {
    console.error('❌ Error marking reminder as sent by event ID:', error);
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
    console.error('❌ Error checking if reminder was sent:', error);
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

    console.log(`✅ Updated reminder in Supabase for event #${eventId}`);
    return true;
  } catch (error) {
    console.error('❌ Error updating reminder in Supabase:', error);
    return false;
  }
}

// Cleanup orphaned reminders (reminders for events that no longer exist)
async function cleanupOrphanedReminders() {
  const client = getSupabaseClient();
  if (!client) return 0;

  try {
    const { getAllEvents } = require('./eventManager');
    const events = getAllEvents();
    const eventIds = Object.keys(events);

    // Get all reminders
    const { data: allReminders, error } = await client
      .from('reminders')
      .select('id, event_id');

    if (error) throw error;
    if (!allReminders || allReminders.length === 0) return 0;

    // Find orphaned reminders (reminders whose events don't exist)
    const orphanedIds = allReminders
      .filter(reminder => !eventIds.includes(reminder.event_id))
      .map(reminder => reminder.id);

    if (orphanedIds.length === 0) return 0;

    // Delete orphaned reminders
    const { error: deleteError } = await client
      .from('reminders')
      .delete()
      .in('id', orphanedIds);

    if (deleteError) throw deleteError;

    console.log(`🧹 Cleaned up ${orphanedIds.length} orphaned reminder(s) from Supabase`);
    return orphanedIds.length;
  } catch (error) {
    console.error('❌ Error cleaning up orphaned reminders:', error);
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

