# 🔌 Achievement & Reminder Wiring Summary

## ✅ What Was Added

### 1. **Supabase Integration** (`src/supabase.js`)
- ✅ `SupabaseClient` class with comprehensive logging
- ✅ `incrementStat()` - Increments user stats (hosts_created, invites_sent, rsvps_made)
- ✅ `getUserStats()` - Fetches user statistics
- ✅ `scheduleReminder()` - Schedules reminders in Supabase
- ✅ `updateReminder()` - Updates existing reminders
- ✅ `cancelReminder()` - Cancels reminders
- ✅ All operations log: `[SUPABASE] Query/Error messages`

### 2. **Achievement Tracking** (`src/achievements.js`)
- ✅ `trackHostCreated()` - Increments hosts_created counter
- ✅ `trackInviteSent()` - Increments invites_sent counter
- ✅ `trackRSVP()` - Increments rsvps_made counter
- ✅ `trackMaybe()` - Tracks maybe responses
- ✅ `trackFastRSVP()` - Detects RSVPs within 5 minutes
- ✅ `trackWorthyEvent()` - Detects 5+ attendee events
- ✅ `checkAvengersAssemble()` - Detects when all invited RSVP
- ✅ `checkMoonKnight()` - Detects midnight-4am PST events
- ✅ `checkWakandaStrategist()` - Detects 3+ day advance planning
- ✅ `trackHostWithTimestamp()` - Tracks hosting frequency
- ✅ All operations log: `[ACHIEVEMENT] Action/Error messages`

### 3. **KV Operations Logging** (`src/index.js`)
All KV operations now have comprehensive logging:
```
[KV] 📖 Reading events from MARVELING_EVENTS
[KV] ✅ Retrieved data: X events, counter: Y
[KV] 💾 Saving event #1001
[KV] 📝 Writing to MARVELING_EVENTS: X events, counter: Y
[KV] ✅ Event #1001 saved successfully
[KV] 🗑️ Deleting event #1001
```

### 4. **Command Processing Logging** (`src/index.js`)
All commands now log their execution:
```
[COMMAND] Processing: playnow for user: 123456789 (username)
[COMMAND] ✅ Supabase client initialized
[COMMAND] Loaded X events from KV
[COMMAND] Tracking host achievements for 123456789
[COMMAND] Current PST hour: 14
[COMMAND] Saving new playnow event #1001
```

### 5. **Button Handler Logging** (`src/index.js`)
All button interactions are logged:
```
[BUTTON] User 123456789 clicked button: rsvp_yes_1001
[BUTTON] RSVP action: yes, eventId: 1001
[BUTTON] Adding 123456789 to attendees for event #1001
[BUTTON] Tracking RSVP achievements for 123456789
[BUTTON] Event #1001 has 5+ attendees, tracking Worthy achievement
[BUTTON] Persisting event #1001 updates to KV
[BUTTON] ✅ Event #1001 updated successfully
```

---

## 🔗 Where Achievement Tracking Is Wired Up

### `/playnow` Command
```javascript
// When event is created:
✅ trackHostCreated(supabase, userId)
✅ checkMoonKnight(supabase, userId, pstHour)
✅ trackHostWithTimestamp(supabase, userId)
```

### `/plan` Command
```javascript
// When event is created:
✅ trackHostCreated(supabase, userId)
✅ checkMoonKnight(supabase, userId, pstHour)
✅ checkWakandaStrategist(supabase, userId, daysInAdvance)
✅ trackHostWithTimestamp(supabase, userId)
✅ supabase.scheduleReminder() // If time is provided
```

### `/invite` Command
```javascript
// When person is invited:
✅ trackInviteSent(supabase, userId)
```

### `/delete` Command
```javascript
// When event is deleted:
✅ supabase.cancelReminder(eventId)
```

### `/reschedule` Command
```javascript
// When event is rescheduled:
✅ supabase.cancelReminder(oldEventId) // Cancel old reminder
✅ supabase.scheduleReminder(newEventId, ...) // Schedule new reminder
```

### RSVP Button (Yes)
```javascript
// When user clicks "Available/Coming":
✅ trackRSVP(supabase, userId, eventId)
✅ trackFastRSVP(supabase, userId, eventCreatedAt)
✅ trackWorthyEvent(supabase, hostUserId, attendeeCount) // If 5+ attendees
✅ checkAvengersAssemble(supabase, event) // If all invited RSVP'd
```

### RSVP Button (Maybe)
```javascript
// When user clicks "Maybe":
✅ trackMaybe(supabase, userId)
```

---

## 📊 How to Track What's Happening

### 1. **Cloudflare Worker Logs**
```bash
# Real-time logs
npx wrangler tail

# Look for these log prefixes:
[KV]          - KV read/write operations
[SUPABASE]    - Supabase queries and responses
[ACHIEVEMENT] - Achievement tracking
[COMMAND]     - Command processing
[BUTTON]      - Button interactions
```

### 2. **Check if KV is Being Written**
Go to: Cloudflare Dashboard → Workers & Pages → KV → MARVELING_EVENTS

You should see:
- **Key:** `events`
- **Value:** JSON with `{ "events": {...}, "counter": 1000 }`

If it's empty after commands:
- Check logs for `[KV] 💾 Saving event` messages
- Check for `[KV] ❌ Error` messages

### 3. **Check if Supabase is Being Called**
Look for these in logs:
```
[SUPABASE] Client initialized with URL: https://...
[SUPABASE] Query: insert on user_stats
[SUPABASE] Fetch: POST https://...
[SUPABASE] Response: 201 ...
[SUPABASE] ✅ Incremented hosts_created for 123456789
```

If you see:
```
[SUPABASE] ⚠️ Missing SUPABASE_URL or SUPABASE_KEY - Supabase disabled
[ACHIEVEMENT] ⚠️ Supabase not available, skipping achievement tracking
```

Then you need to set secrets:
```bash
npx wrangler secret put SUPABASE_KEY
```

### 4. **Verify Achievement Counters**
After running commands, check Supabase:
```sql
SELECT * FROM user_stats WHERE user_id = 'YOUR_DISCORD_ID';
```

You should see:
- `hosts_created` increment after `/playnow` or `/plan`
- `invites_sent` increment after `/invite`
- `rsvps_made` increment after clicking RSVP buttons

---

## 🔧 Environment Setup

### Required Secrets (use `wrangler secret put`)
```bash
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put SUPABASE_KEY
```

### Required Environment Variables (in `wrangler.jsonc`)
```jsonc
"vars": {
  "SUPABASE_URL": "https://dpuyxyipcpljrnndgdwx.supabase.co",
  "RIVALING_ROLE_ID": "1424487231636242473"
}
```

---

## 🧪 Testing Checklist

### 1. Test KV Writing
```bash
# Deploy worker
npx wrangler deploy

# Run a command (e.g., /playnow)
# Check logs
npx wrangler tail

# Look for:
✅ [KV] 💾 Saving event #1001
✅ [KV] 📝 Writing to MARVELING_EVENTS: 1 events, counter: 1001
✅ [KV] ✅ Event #1001 saved successfully

# Check Cloudflare Dashboard → KV → MARVELING_EVENTS
# Should see "events" key with data
```

### 2. Test Supabase Writing
```bash
# Ensure SUPABASE_KEY is set
npx wrangler secret put SUPABASE_KEY

# Run a command (e.g., /playnow)
# Check logs
npx wrangler tail

# Look for:
✅ [SUPABASE] Client initialized with URL: ...
✅ [SUPABASE] Query: insert on user_stats
✅ [SUPABASE] ✅ Incremented hosts_created for 123456789

# Check Supabase directly:
SELECT * FROM user_stats WHERE user_id = 'YOUR_DISCORD_ID';
```

### 3. Test RSVP Achievements
```bash
# Create an event with /playnow
# Click "I'm coming!" button
# Check logs
npx wrangler tail

# Look for:
✅ [BUTTON] User 123456789 clicked button: rsvp_yes_1001
✅ [BUTTON] Adding 123456789 to attendees for event #1001
✅ [BUTTON] Tracking RSVP achievements for 123456789
✅ [ACHIEVEMENT] trackRSVP for user 123456789 on event 1001
✅ [SUPABASE] Incrementing rsvps_made for user 123456789
```

### 4. Test Reminders
```bash
# Create a planned event with /plan
# Check logs for:
✅ [COMMAND] Scheduling reminder for event #1001
✅ [SUPABASE] Scheduling reminder for event 1001 at 2025-12-11T18:00:00Z

# Check Supabase:
SELECT * FROM reminders WHERE event_id = '1001';
```

---

## 🐛 Troubleshooting

### Issue: KV is empty
**Check:**
1. Logs show `[KV] 💾 Saving event` messages?
2. Any `[KV] ❌ Error` messages?
3. KV namespace binding is correct in `wrangler.jsonc`?

### Issue: Achievements not incrementing
**Check:**
1. Logs show `[SUPABASE] Client initialized`?
2. If you see `⚠️ Supabase not available` → Set `SUPABASE_KEY`
3. Logs show `[SUPABASE] Query: insert/update on user_stats`?
4. Check Supabase response status (should be 200/201)

### Issue: Reminders not scheduling
**Check:**
1. Logs show `[COMMAND] Scheduling reminder`?
2. Logs show `[SUPABASE] Scheduling reminder for event`?
3. Check `reminders` table in Supabase
4. Verify `reminder_time` is in ISO format

---

## 📝 Next Steps

1. **Deploy the worker:**
   ```bash
   cd marveling-bot
   npx wrangler deploy
   ```

2. **Watch logs in real-time:**
   ```bash
   npx wrangler tail
   ```

3. **Test commands in Discord:**
   - `/playnow` → Check KV + achievements
   - Click RSVP button → Check achievements
   - `/plan Friday 8PM` → Check reminders
   - `/invite @someone` → Check invite tracking

4. **Verify in dashboards:**
   - Cloudflare: Check KV has `events` key
   - Supabase: Check `user_stats` and `reminders` tables

---

## 🎯 Summary

**Before:**
- ❌ Supabase logic existed but was never called
- ❌ Achievement functions were never triggered
- ❌ No logging for debugging
- ❌ KV operations were silent

**After:**
- ✅ All achievement functions wired up in commands and buttons
- ✅ Reminders schedule/update/cancel in Supabase
- ✅ Comprehensive logging for all operations
- ✅ Easy to debug with log prefixes ([KV], [SUPABASE], [ACHIEVEMENT], etc.)
- ✅ KV operations visible and traceable

All changes are minimal and focused on wiring up existing logic with comprehensive logging!

