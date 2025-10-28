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

// Get pending reminders that should be sent now
async function getPendingReminders() {
  const client = getSupabaseClient();
  if (!client) return [];

  try {
    const now = new Date().toISOString();
    
    const { data, error } = await client
      .from('reminders')
      .select('*')
      .eq('sent', false)
      .lte('reminder_time', now)
      .order('reminder_time', { ascending: true });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('❌ Error fetching pending reminders:', error);
    return [];
  }
}

// Mark reminder as sent
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

module.exports = {
  getSupabaseClient,
  scheduleReminder,
  cancelReminder,
  getPendingReminders,
  markReminderSent,
  updateReminder
};

