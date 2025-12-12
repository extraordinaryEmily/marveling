// Supabase client for Cloudflare Workers
// Minimal implementation using fetch API

export class SupabaseClient {
  constructor(url, key) {
    this.url = url;
    this.key = key;
    this.headers = {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`
    };
    console.log('[SUPABASE] Client initialized with URL:', url);
  }

  async query(table, operation, data = null, filter = null) {
    const endpoint = `${this.url}/rest/v1/${table}`;
    console.log(`[SUPABASE] Query: ${operation} on ${table}`, { data, filter });
    
    try {
      let url = endpoint;
      let options = {
        headers: this.headers
      };

      switch (operation) {
        case 'select':
          options.method = 'GET';
          if (filter) {
            const params = new URLSearchParams(filter);
            url += `?${params.toString()}`;
          }
          break;
        case 'insert':
          options.method = 'POST';
          options.body = JSON.stringify(data);
          break;
        case 'update':
          options.method = 'PATCH';
          options.body = JSON.stringify(data);
          if (filter) {
            const params = new URLSearchParams(filter);
            url += `?${params.toString()}`;
          }
          break;
        case 'upsert':
          options.method = 'POST';
          options.headers['Prefer'] = 'resolution=merge-duplicates';
          options.body = JSON.stringify(data);
          break;
        case 'delete':
          options.method = 'DELETE';
          if (filter) {
            const params = new URLSearchParams(filter);
            url += `?${params.toString()}`;
          }
          break;
      }

      console.log(`[SUPABASE] Fetch: ${options.method} ${url}`);
      const response = await fetch(url, options);
      const text = await response.text();
      console.log(`[SUPABASE] Response: ${response.status}`, text.substring(0, 200));
      
      if (!response.ok) {
        console.error(`[SUPABASE] Error ${response.status}:`, text);
        throw new Error(`Supabase ${operation} failed: ${response.status} ${text}`);
      }

      return text ? JSON.parse(text) : null;
    } catch (error) {
      console.error(`[SUPABASE] Query error:`, error);
      throw error;
    }
  }

  async incrementStat(userId, field, amount = 1) {
    console.log(`[SUPABASE] Incrementing ${field} for user ${userId} by ${amount}`);
    
    // First try to get existing stat
    const existing = await this.query('user_stats', 'select', null, { user_id: `eq.${userId}` });
    
    if (existing && existing.length > 0) {
      const current = existing[0][field] || 0;
      const newValue = current + amount;
      console.log(`[SUPABASE] Updating ${field}: ${current} -> ${newValue}`);
      
      const updateData = {};
      updateData[field] = newValue;
      await this.query('user_stats', 'update', updateData, { user_id: `eq.${userId}` });
    } else {
      console.log(`[SUPABASE] Creating new user_stats row for ${userId}`);
      const insertData = { user_id: userId };
      insertData[field] = amount;
      await this.query('user_stats', 'insert', insertData);
    }
    
    console.log(`[SUPABASE] ✅ Incremented ${field} for user ${userId}`);
  }

    /* =========================================================================
     USER STATS (REPLACEMENTS FOR supabaseClient.js)
  ========================================================================= */

  async getUserStatsFromSupabase(userId) {
    console.log(`[SUPABASE] Getting stats for user ${userId}`);
  
    try {
      // Query using your wrapper
      const result = await this.query(
        'user_stats',
        'select',
        '*',
        { user_id: `eq.${userId}` }
      );
  
      // Normal Supabase returns an array, but your wrapper may return either
      const row = Array.isArray(result) ? result[0] : result;
  
      if (row) {
        console.log(`[SUPABASE] Found stats:`, row);
  
        return {
          user_id: row.user_id,
          hosts_created: row.hosts_created ?? 0,
          invites_sent: row.invites_sent ?? 0,
          rsvps_made: row.rsvps_made ?? 0,
          maybe_count: row.maybe_count ?? 0,
          fast_rsvps: row.fast_rsvps ?? 0,
          worthy_events: row.worthy_events ?? 0,
          no_response_count: row.no_response_count ?? 0,
          recent_host_timestamps: row.recent_host_timestamps ?? [],
          achievements: row.achievements ?? []
        };
      }
  
      console.log(`[SUPABASE] No stats found for user ${userId}, returning defaults`);
    } catch (err) {
      console.log(`[SUPABASE] Error fetching user stats:`, err);
    }
  
    // Default return
    return {
      user_id: userId,
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
  }

  async updateUserStatsInSupabase(userId, stats) {
    const body = {
      user_id: userId.toString(),
      hosts_created: stats.hostsCreated ?? 0,
      invites_sent: stats.invitesSent ?? 0,
      rsvps_made: stats.rsvpsMade ?? 0,
      maybe_count: stats.maybeCount ?? 0,
      fast_rsvps: stats.fastRSVPs ?? 0,
      worthy_events: stats.worthyEvents ?? 0,
      no_response_count: stats.noResponseCount ?? 0,
      recent_host_timestamps: stats.recentHostTimestamps ?? [],
      achievements: stats.achievements ?? []
    };

    try {
      await this.query('user_stats', 'upsert', body);
      return true;
    } catch (e) {
      return false;
    }
  }


  /* =========================================================================
     EVENT ACHIEVEMENT CREDITS
  ========================================================================= */

  async checkEventAchievementCredit(eventId, userId, type) {
    try {
      const result = await this.query(
        'event_achievement_credits',
        'select',
        'id',
        {
          event_id: `eq.${eventId}`,
          user_id: `eq.${userId}`,
          credit_type: type
        }
      );
      return result && result.length > 0;
    } catch {
      return false;
    }
  }

  async markEventAchievementCredit(eventId, userId, type) {
    const body = {
      event_id: eventId.toString(),
      user_id: userId.toString(),
      credit_type: type
    };

    try {
      await this.query('event_achievement_credits', 'insert', body);
      return true;
    } catch (err) {
      // ignore duplicate credit errors
      return true;
    }
  }

  async clearEventCreditsFromSupabase(eventId) {
    try {
      await this.query(
        'event_achievement_credits',
        'delete',
        null,
        { event_id: `eq.${eventId}` }
      );
      return true;
    } catch {
      return false;
    }
  }

  async getEventRespondersFromSupabase(eventId) {
    try {
      const result = await this.query(
        'event_achievement_credits',
        'select',
        'user_id',
        { event_id: `eq.${eventId}` }
      );

      return new Set(result.map(r => r.user_id));
    } catch {
      return new Set();
    }
  }


  /* =========================================================================
     EVENT RESCHEDULE COUNTS
  ========================================================================= */

  async getEventRescheduleCountFromSupabase(eventId) {
    try {
      const result = await this.query(
        'event_reschedule_count',
        'select',
        '*',
        { event_id: `eq.${eventId}` }
      );

      const row = Array.isArray(result) ? result[0] : result;
      return row?.reschedule_count ?? 0;
    } catch {
      return 0;
    }
  }

  async updateEventRescheduleCountInSupabase(eventId, count) {
    const body = {
      event_id: eventId.toString(),
      reschedule_count: count
    };

    try {
      await this.query('event_reschedule_count', 'upsert', body);
      return true;
    } catch {
      return false;
    }
  }

  async clearEventRescheduleCountFromSupabase(eventId) {
    try {
      await this.query(
        'event_reschedule_count',
        'delete',
        null,
        { event_id: `eq.${eventId}` }
      );
      return true;
    } catch {
      return false;
    }
  }

  /* =========================================================================
     REMINDERS
  ========================================================================= */

  async scheduleReminder(eventId, reminderTime, channelId, attendees = []) {
    console.log(`[SUPABASE] Scheduling reminder for event ${eventId} at ${reminderTime}`);
    
    const data = {
      event_id: eventId,
      reminder_time: reminderTime,
      channel_id: channelId,
      attendees: attendees,
      sent: false
    };
    
    await this.query('reminders', 'insert', data);
    console.log(`[SUPABASE] ✅ Reminder scheduled for event ${eventId}`);
  }

  async updateReminder(eventId, reminderTime, attendees = []) {
    console.log(`[SUPABASE] Updating reminder for event ${eventId}`);
    
    const data = {
      reminder_time: reminderTime,
      attendees: attendees,
      sent: false
    };
    
    await this.query('reminders', 'update', data, { event_id: `eq.${eventId}` });
    console.log(`[SUPABASE] ✅ Reminder updated for event ${eventId}`);
  }

  async cancelReminder(eventId) {
    console.log(`[SUPABASE] Canceling reminder for event ${eventId}`);
    await this.query('reminders', 'delete', null, { event_id: `eq.${eventId}` });
    console.log(`[SUPABASE] ✅ Reminder canceled for event ${eventId}`);
  }
}

export const supabaseHelpers = {
  getUserStatsFromSupabase: (c, ...a) => c.getUserStatsFromSupabase(...a),
  updateUserStatsInSupabase: (c, ...a) => c.updateUserStatsInSupabase(...a),
  checkEventAchievementCredit: (c, ...a) => c.checkEventAchievementCredit(...a),
  markEventAchievementCredit: (c, ...a) => c.markEventAchievementCredit(...a),
  clearEventCreditsFromSupabase: (c, ...a) => c.clearEventCreditsFromSupabase(...a),
  getEventRespondersFromSupabase: (c, ...a) => c.getEventRespondersFromSupabase(...a),
  getEventRescheduleCountFromSupabase: (c, ...a) => c.getEventRescheduleCountFromSupabase(...a),
  updateEventRescheduleCountInSupabase: (c, ...a) => c.updateEventRescheduleCountInSupabase(...a),
  clearEventRescheduleCountFromSupabase: (c, ...a) => c.clearEventRescheduleCountFromSupabase(...a)
};


export function createSupabaseClient(env) {
  console.log('[SUPABASE] 🔍 Checking environment variables...');
  console.log('[SUPABASE] env object keys:', Object.keys(env || {}));
  console.log('[SUPABASE] SUPABASE_URL:', env?.SUPABASE_URL ? 'SET ✅' : 'MISSING ❌');
  console.log('[SUPABASE] SUPABASE_KEY:', env?.SUPABASE_KEY ? 'SET ✅' : 'MISSING ❌');
  
  if (!env || !env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.warn('[SUPABASE] ⚠️ Missing SUPABASE_URL or SUPABASE_KEY - Supabase disabled');
    console.warn('[SUPABASE] env.SUPABASE_URL:', env?.SUPABASE_URL);
    console.warn('[SUPABASE] env.SUPABASE_KEY:', env?.SUPABASE_KEY ? '[REDACTED]' : 'undefined');
    return null;
  }
  
  console.log('[SUPABASE] ✅ Creating client with URL:', env.SUPABASE_URL);
  return new SupabaseClient(env.SUPABASE_URL, env.SUPABASE_KEY);
}

