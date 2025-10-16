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

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
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
   node deploy-commands.js
   ```

5. **Start the bot**
   ```bash
   node index.js
   ```

---

## 📦 Dependencies

- **discord.js** - Discord API wrapper
- **chrono-node** - Natural language date/time parsing
- **dotenv** - Environment variable management

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
