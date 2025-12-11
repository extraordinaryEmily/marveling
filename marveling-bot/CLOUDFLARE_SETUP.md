# Cloudflare Worker Setup for Marveling Bot

## 🚀 Quick Setup

### 1. Set Discord Public Key

In `src/index.js`, line 4, replace with your bot's public key from Discord Developer Portal:
```javascript
const PUBLIC_KEY = 'YOUR_PUBLIC_KEY_HERE';
```

Find it at: https://discord.com/developers/applications → Your App → General Information → Public Key

### 2. Set Environment Variables & Secrets

```bash
# Set secrets (sensitive data)
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put SUPABASE_KEY

# Public environment variables are in wrangler.jsonc
```

### 3. Deploy to Cloudflare

```bash
cd marveling-bot
npm install
npx wrangler deploy
```

Your worker will be available at: `https://marveling-bot.YOUR_SUBDOMAIN.workers.dev`

### 4. Configure Discord Interactions URL

1. Go to Discord Developer Portal: https://discord.com/developers/applications
2. Select your application
3. Go to "General Information"
4. Set **Interactions Endpoint URL** to:
   ```
   https://marveling-bot.YOUR_SUBDOMAIN.workers.dev/interactions
   ```
5. Click "Save Changes"
6. Discord will send a PING to verify - your worker will respond with PONG

---

## 🔧 Configuration

### Environment Variables (in wrangler.jsonc)

```jsonc
"vars": {
  "SUPABASE_URL": "https://dpuyxyipcpljrnndgdwx.supabase.co",
  "RIVALING_ROLE_ID": "1424487231636242473"
}
```

### Secrets (use wrangler secret put)

- `DISCORD_TOKEN`: Your bot token
- `SUPABASE_KEY`: Your Supabase anon/service key

### Cron Jobs

Configured to run every hour (for reminders):
```jsonc
"triggers": {
  "crons": ["0 * * * *"]
}
```

For more frequent checks, use: `"*/20 * * * *"` (every 20 minutes)

---

## 📁 Workers KV Storage (Optional)

If you want to store events in Workers KV instead of Supabase:

1. Create KV namespace:
   ```bash
   npx wrangler kv:namespace create "MARVELING_EVENTS"
   ```

2. Add to wrangler.jsonc:
   ```jsonc
   "kv_namespaces": [
     {
       "binding": "MARVELING_EVENTS",
       "id": "YOUR_KV_NAMESPACE_ID"
     }
   ]
   ```

3. Access in code:
   ```javascript
   await env.MARVELING_EVENTS.get('key');
   await env.MARVELING_EVENTS.put('key', 'value');
   ```

---

## 🧪 Testing Locally

```bash
# Start local dev server
npx wrangler dev

# In another terminal, test with curl
curl -X POST http://localhost:8787/interactions \
  -H "Content-Type: application/json" \
  -d '{"type": 1}'
```

Note: Local testing of Discord interactions is tricky due to signature verification. Consider using ngrok or the Discord API directly.

---

## 🔐 Security Notes

1. **Never commit secrets** - Use `wrangler secret put`
2. **Public key verification** - Worker verifies all requests from Discord
3. **HTTPS only** - Workers automatically use HTTPS
4. **Environment isolation** - Secrets are encrypted at rest

---

## 🚨 Troubleshooting

### "Invalid request signature" error

- Double-check your PUBLIC_KEY in src/index.js
- Make sure you're using the PUBLIC_KEY, not the bot token
- Verify the key is from the correct Discord application

### Worker not receiving interactions

- Verify Interactions Endpoint URL in Discord Developer Portal
- Check worker logs: `npx wrangler tail`
- Ensure worker is deployed: `npx wrangler deployments list`

### Commands not working

1. Register slash commands:
   ```bash
   cd ..
   node deploy-commands.js
   ```

2. Commands may take up to 1 hour to propagate globally
3. For guild commands, they're instant

---

## 📊 Monitoring

```bash
# View real-time logs
npx wrangler tail

# View deployment info
npx wrangler deployments list

# View worker stats
npx wrangler pages deployment list
```

---

## 🔄 Next Steps

To fully integrate with your bot commands:

1. **Connect to Supabase**: Add database calls in command handlers
2. **Implement command logic**: Port logic from ../commands/*.js
3. **Add event management**: Use KV or Supabase for events
4. **Set up reminders**: Implement scheduled() handler
5. **Add achievement tracking**: Connect to Supabase achievements

Example structure:
```javascript
async function handleCommand(interaction, env) {
  const commandName = interaction.data.name;
  
  // Access secrets
  const DISCORD_TOKEN = env.DISCORD_TOKEN;
  const SUPABASE_KEY = env.SUPABASE_KEY;
  
  // Access KV
  const events = await env.MARVELING_EVENTS.get('events');
  
  // Your command logic here
}
```

---

## 📚 Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Discord Interactions Docs](https://discord.com/developers/docs/interactions/receiving-and-responding)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
- [Workers KV Docs](https://developers.cloudflare.com/kv/)

