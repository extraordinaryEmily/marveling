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

  async getUserStats(userId) {
    console.log(`[SUPABASE] Getting stats for user ${userId}`);
    const result = await this.query('user_stats', 'select', null, { user_id: `eq.${userId}` });
    
    if (result && result.length > 0) {
      console.log(`[SUPABASE] Found stats:`, result[0]);
      return result[0];
    }
    
    console.log(`[SUPABASE] No stats found for user ${userId}, returning defaults`);
    return {
      user_id: userId,
      hosts_created: 0,
      invites_sent: 0,
      rsvps_made: 0
    };
  }

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

