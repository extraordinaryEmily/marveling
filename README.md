# Marveling 🦸

### *because i dont want to use other people's bots*

<div align="center">

![Marvel Rivals](./marvel-rivals-combat.webp)

**A custom Discord bot for coordinating Marvel Rivals game sessions**  
Squad up with friends, track achievements, and never miss a match!

</div>

---

## ✨ Features

### 🎮 Event Management
- **Create Events** - Schedule impromptu or planned game nights with automatic PST timezone handling
- **List Events** - View all active events with confirmed players at a glance
- **Guest Management** - See who's invited, who's RSVP'd, and track outside guests
- **Reschedule** - Easily reschedule planned sessions with natural language parsing
- **Smart Invites** - Invite server members or outside guests (max +5 per user per event)

### 🏆 Achievement System
- Track your gaming activity and unlock achievements
- View leaderboards and compare stats with friends
- Earn rewards for hosting events and inviting players

### ⏰ Smart Reminders
- Automatic reminders for scheduled events
- Natural language time parsing (e.g., "tomorrow at 7pm", "Friday evening")
- PST timezone support

---

## 🚀 Commands

| Command | Description |
|---------|-------------|
| `/create` | Create an impromptu or planned event |
| `/list` | View all active events with confirmed players |
| `/guests` | View the full guest list for a specific event |
| `/invite` | Invite users or add outside guests (max +5 per event) |
| `/reschedule` | Reschedule a planned game night |
| `/delete` | Cancel and delete an event |
| `/achievements` | View your rankings and achievements |
| `/help` | View help message in Discord |

---

## 🛠️ Setup

### Prerequisites
- Node.js (v16.9.0 or higher)
- A Discord Bot Token
- Discord Application ID
- **Important:** Users need the `@rivaling` role in your server to use the bot

### Local Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/extraordinaryEmily/marveling
   cd marveling
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create a `.env` file**
   ```env
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_application_id_here
   GUILD_ID=your_server_id_here
   ```

4. **Deploy slash commands**
   ```bash
   npm run deploy
   ```

5. **Start the bot**
   ```bash
   npm start
   ```

---

## ☁️ Deploy to Railway (Recommended - Actually Free!)

### Why Railway?
- ✅ **Actually free:** $5 credit/month
- ✅ **Smart sleep schedule:** Bot sleeps 2am-10am PST to stay within free tier
- ✅ **Data persistence:** All events and achievements saved to disk
- ✅ **Math:** 16hrs/day × 30 days = ~480 hrs = ~$4.80/month ✅

### Step 1: Prepare Your Repository

1. **Ensure your code is pushed to GitHub**
   ```bash
   git add .
   git commit -m "Add sleep schedule for Railway deployment"
   git push origin main
   ```

### Step 2: Deploy on Railway

1. **Sign up at [railway.app](https://railway.app)**

2. **Create a New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `marveling` repository

3. **Add Environment Variables:**
   - Click on your deployed service
   - Go to "Variables" tab
   - Add: `DISCORD_TOKEN` = `your_bot_token_here`

4. **Deploy!**
   - Railway automatically builds and deploys
   - Your bot will be live! 🎉

### Step 3: Deploy Commands to Discord

Once deployed, you need to register your slash commands (one-time setup):

**Run locally:**
```bash
npm run deploy
```

### 😴 Sleep Schedule

The bot automatically sleeps **2am-10am PST** to save Railway credits:
- At 2am PST: Bot gracefully shuts down
- Railway restarts it periodically, but it exits if still in sleep hours
- At 10am PST: Bot stays running when Railway restarts it
- **Your data is safe!** Everything is saved to disk before shutdown

**Want to change sleep hours?** Edit `index.js` lines 57-62.

### 💾 Data Persistence

The bot automatically saves all data (events, achievements, user stats) to local JSON files:
- ✅ Data survives restarts
- 💾 Auto-saves every 30 seconds
- 📁 Saves immediately on any data change
- 🔄 Loads data automatically on startup

---

## 📦 Dependencies

- **discord.js** - Discord API wrapper
- **chrono-node** - Natural language date/time parsing
- **dotenv** - Environment variable management
- **luxon** - Advanced date/time handling

---

## 🎯 Usage Examples

**Create an impromptu session:**
```
/create type:impromptu
```

**Schedule a game night:**
```
/create type:planned time:tomorrow at 8pm
```

**Invite friends:**  
Doesn't give a external link anymore
```
/invite id:1001 person:@friend
/invite id:1001 guest:+2
```

**Check who's coming:**
```
/guests id:1001
```

---

## 📝 License

ISC

---

<div align="center">
Made with ❤️
</div>
