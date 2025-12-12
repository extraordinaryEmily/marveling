# 🔍 Debug Guide - Environment & KV Issues

## Issue: Supabase shows as disabled even though secrets are set

### Step 1: Deploy with new logging
```bash
cd /Users/eloh/Downloads/Repos/marveling/marveling-bot
npx wrangler deploy
```

### Step 2: Check debug endpoint
```bash
curl https://marveling-bot.YOUR_SUBDOMAIN.workers.dev/debug-env
```

This will show you:
- What keys are in the `env` object
- Whether KV binding is present
- Whether environment variables are set

### Step 3: Run a command and watch logs
```bash
# In one terminal, watch logs
npx wrangler tail

# In Discord, run: /playnow
```

Look for these log lines:
```
[COMMAND] ========================================
[COMMAND] Processing: playnow for user: ...
[COMMAND] 🔍 Environment check:
[COMMAND] - env object: EXISTS ✅ or MISSING ❌
[COMMAND] - env keys: [array of keys]
[COMMAND] - SUPABASE_URL: SET ✅ or MISSING ❌
[COMMAND] - SUPABASE_KEY: SET ✅ or MISSING ❌
[COMMAND] - MARVELING_EVENTS: BOUND ✅ or MISSING ❌
```

---

## Common Issues & Fixes

### Issue 1: `env` object is empty or missing keys

**Cause:** Worker not deployed after setting secrets

**Fix:**
```bash
npx wrangler deploy
```

### Issue 2: SUPABASE_KEY shows as MISSING even though secret is set

**Possible causes:**
1. Secret was set but worker wasn't redeployed
2. Secret name doesn't match (case-sensitive)

**Fix:**
```bash
# Check current secrets
npx wrangler secret list

# If SUPABASE_KEY is listed, redeploy
npx wrangler deploy

# If not listed, set it again
npx wrangler secret put SUPABASE_KEY
# Paste your Supabase anon key when prompted
```

### Issue 3: MARVELING_EVENTS binding missing

**Check wrangler.jsonc:**
```jsonc
"kv_namespaces": [
  {
    "binding": "MARVELING_EVENTS",
    "id": "c5939c54f5b14b8ab25ebf3c7a5c5721"
  }
]
```

**Verify KV namespace exists:**
```bash
npx wrangler kv:namespace list
```

Should show:
```json
[
  {
    "id": "c5939c54f5b14b8ab25ebf3c7a5c5721",
    "title": "marveling-bot-MARVELING_EVENTS"
  }
]
```

If not found, create it:
```bash
npx wrangler kv:namespace create "MARVELING_EVENTS"
```

Then update the `id` in `wrangler.jsonc` with the new ID.

### Issue 4: KV is empty (no key-value pairs)

**This is normal if no commands have been run yet!**

KV will only have data after you:
1. Run `/playnow` or `/plan` command in Discord
2. Worker successfully saves the event

**To verify KV is working:**
```bash
# Watch logs
npx wrangler tail

# Run /playnow in Discord

# Look for these logs:
[KV] 📖 Reading events from MARVELING_EVENTS
[KV] 🔍 MARVELING_EVENTS binding: EXISTS ✅
[KV] ⚠️ No data found, returning defaults  # <-- This is OK for first run
[KV] 💾 Saving event #1000
[KV] 📝 Writing to MARVELING_EVENTS: 1 events, counter: 1001
[KV] ✅ Event #1000 saved successfully
```

**Then check KV in Cloudflare Dashboard:**
- Go to: Workers & Pages → KV → MARVELING_EVENTS
- You should see key: `events`
- Click to view the JSON value

---

## Quick Diagnostic Commands

### 1. Check all secrets
```bash
npx wrangler secret list
```

Expected output:
```json
[
  { "name": "DISCORD_TOKEN", "type": "secret_text" },
  { "name": "SUPABASE_KEY", "type": "secret_text" }
]
```

### 2. Check KV namespaces
```bash
npx wrangler kv:namespace list
```

### 3. Check what's in KV
```bash
npx wrangler kv:key list --namespace-id=c5939c54f5b14b8ab25ebf3c7a5c5721
```

### 4. Read a specific KV key
```bash
npx wrangler kv:key get "events" --namespace-id=c5939c54f5b14b8ab25ebf3c7a5c5721
```

### 5. Manually write to KV (for testing)
```bash
npx wrangler kv:key put "events" '{"events":{},"counter":1000}' --namespace-id=c5939c54f5b14b8ab25ebf3c7a5c5721
```

---

## Expected Log Flow for /playnow Command

```
[COMMAND] ========================================
[COMMAND] Processing: playnow for user: 123456789 (username)
[COMMAND] 🔍 Environment check:
[COMMAND] - env object: EXISTS ✅
[COMMAND] - env keys: ['SUPABASE_URL', 'SUPABASE_KEY', 'RIVALING_ROLE_ID', 'MARVELING_EVENTS', ...]
[COMMAND] - SUPABASE_URL: SET ✅
[COMMAND] - SUPABASE_KEY: SET ✅
[COMMAND] - MARVELING_EVENTS: BOUND ✅
[COMMAND] - RIVALING_ROLE_ID: 1424487231636242473
[COMMAND] ========================================

[SUPABASE] 🔍 Checking environment variables...
[SUPABASE] env object keys: ['SUPABASE_URL', 'SUPABASE_KEY', ...]
[SUPABASE] SUPABASE_URL: SET ✅
[SUPABASE] SUPABASE_KEY: SET ✅
[SUPABASE] ✅ Creating client with URL: https://dpuyxyipcpljrnndgdwx.supabase.co

[COMMAND] ✅ Supabase client initialized
[KV] 📖 Reading events from MARVELING_EVENTS
[KV] 🔍 env object keys: ['SUPABASE_URL', 'SUPABASE_KEY', ...]
[KV] 🔍 MARVELING_EVENTS binding: EXISTS ✅
[KV] Calling env.MARVELING_EVENTS.get("events", "json")...
[KV] Raw data from KV: null
[KV] ⚠️ No data found, returning defaults
[COMMAND] Loaded 0 events from KV
[COMMAND] Playnow: userId=123456789, nextEventId=1000
[COMMAND] Saving new playnow event #1000
[KV] 💾 Saving event #1000
[KV] 📖 Reading events from MARVELING_EVENTS
[KV] 🔍 MARVELING_EVENTS binding: EXISTS ✅
[KV] 📝 Writing to MARVELING_EVENTS: 1 events, counter: 1001
[KV] ✅ Event #1000 saved successfully

[COMMAND] Tracking host achievements for 123456789
[ACHIEVEMENT] trackHostCreated for user 123456789
[SUPABASE] Incrementing hosts_created for user 123456789 by 1
[SUPABASE] Query: select on user_stats
[SUPABASE] Fetch: GET https://dpuyxyipcpljrnndgdwx.supabase.co/rest/v1/user_stats?user_id=eq.123456789
[SUPABASE] Response: 200 []
[SUPABASE] Creating new user_stats row for 123456789
[SUPABASE] Query: insert on user_stats
[SUPABASE] Fetch: POST https://dpuyxyipcpljrnndgdwx.supabase.co/rest/v1/user_stats
[SUPABASE] Response: 201 [{"user_id":"123456789","hosts_created":1,...}]
[SUPABASE] ✅ Incremented hosts_created for user 123456789
[ACHIEVEMENT] ✅ Incremented hosts_created for 123456789
```

---

## Still Not Working?

Share the output of:
1. `npx wrangler secret list`
2. `curl https://your-worker.workers.dev/debug-env`
3. Logs from `npx wrangler tail` after running `/playnow`

This will help identify exactly where the issue is!

