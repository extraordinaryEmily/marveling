# Marveling Bot - Cloudflare Worker

Discord bot for organizing Marvel Rivals game sessions, deployed as a Cloudflare Worker (serverless, gateway-free).

## 🚀 Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set your Discord public key** in `src/index.js`
   ```javascript
   const PUBLIC_KEY = 'your_public_key_here';
   ```

3. **Configure secrets**
   ```bash
   npx wrangler secret put DISCORD_TOKEN
   npx wrangler secret put SUPABASE_KEY
   ```

4. **Deploy**
   ```bash
   npx wrangler deploy
   ```

5. **Set Discord Interactions URL**
   - Go to https://discord.com/developers/applications
   - Set Interactions Endpoint URL to: `https://marveling-bot.YOUR_SUBDOMAIN.workers.dev/interactions`

## 📖 Documentation

See [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md) for detailed setup instructions.

## ✨ Features

- ✅ Serverless Discord bot (no Gateway connection)
- ✅ HTTP-only interactions
- ✅ Button-based RSVP system
- ✅ Cron-based reminders
- ✅ Supabase integration
- ✅ Workers KV storage (optional)
- ✅ Edge deployment (ultra-low latency)

## 🏗️ Architecture

```
Discord → Cloudflare Worker → Supabase
              ↓
         Cron Jobs (reminders)
              ↓
         Workers KV (optional storage)
```

## 🔧 Development

```bash
# Local development
npx wrangler dev

# View logs
npx wrangler tail

# Deploy
npx wrangler deploy
```

## 📝 Environment Variables

Set in `wrangler.jsonc`:
- `SUPABASE_URL`: Your Supabase project URL
- `RIVALING_ROLE_ID`: Discord role ID for @rivaling

Set as secrets:
- `DISCORD_TOKEN`: Your bot token
- `SUPABASE_KEY`: Your Supabase key

## 🧪 Testing

```bash
# Run tests
npm test

# Test Discord interaction locally
curl -X POST http://localhost:8787/interactions \
  -H "Content-Type: application/json" \
  -d '{"type": 1}'
```

## 📚 Commands

- `/playnow` - Create immediate play session
- `/plan <time>` - Plan game night
- `/list` - View active events
- `/guests <id>` - View event guests
- `/invite <id>` - Invite to event
- `/reschedule <id> <time>` - Reschedule event
- `/delete <id>` - Delete event
- `/achievements` - View achievements
- `/help` - Show help

## 🔗 Links

- [Parent Bot Repo](../)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Discord Interactions Docs](https://discord.com/developers/docs/interactions/receiving-and-responding)

