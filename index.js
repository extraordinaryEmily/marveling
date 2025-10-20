require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Partials, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { getAllEvents, deleteEvent, cancelReminder } = require('./utils/eventManager');
const { processEventNonResponders, clearEventCredits } = require('./utils/achievementManager');
const chrono = require('chrono-node');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers, // ✅ Needed for fetching role.members and reactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();

// Load commands dynamically
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

client.once('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: '❌ Error running command', flags: MessageFlags.Ephemeral });
  }
});

client.login(process.env.DISCORD_TOKEN);

// ========================================
// Express Server for Render Health Checks
// ========================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.status(200).send('🦸 Marveling bot is alive!');
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    bot: client.user ? client.user.tag : 'Not ready'
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Express server running on port ${PORT}`);
});

// ========================================
// Self-Ping Keep-Alive Service
// ========================================
const RENDER_URL = process.env.RENDER_URL; // e.g., https://your-app-name.onrender.com

function keepAlive() {
  if (!RENDER_URL) {
    console.log('⚠️  RENDER_URL not set, skipping keep-alive ping');
    return;
  }

  setInterval(() => {
    const now = new Date();
    const events = getAllEvents();
    for (const eventId in events) {
      const event = events[eventId];

      // ✅ Only proceed if this event actually has a reminder set
      if (event.reminderTimeoutId && event.reminderTime) {
        try {
          const reminderTime = new Date(event.reminderTime);

          if (isNaN(reminderTime.getTime())) {
            console.warn(`⚠️ Event ${eventId} has invalid reminderTime:`, event.reminderTime);
            continue;
          }

          const timeLeft = reminderTime.getTime() - now.getTime();
          const minsLeft = (timeLeft / 60000).toFixed(1);

          // ✅ Show whether reminder already fired or still pending
          if (timeLeft > 0) {
            console.log(`⏳ Event ${eventId} reminder in ${minsLeft} minutes (${timeLeft}ms)`);
          } else {
            console.log(`⚠️ Event ${eventId} reminder already passed ${Math.abs(minsLeft)} minutes ago`);
          }

        } catch (err) {
          console.error(`❌ Error reading reminderTime for event ${eventId}:`, err);
        }
      }
    }
    const activeEventIds = Object.keys(events).filter(id => {
      const e = events[id];
      return e.reminderTimeoutId || e.type === 'now';
    });
    if (activeEventIds.length > 0) {
      console.log(`📋 Active events: ${activeEventIds.join(', ')}`);
    } else {
      console.log('📭 No active events currently scheduled.');
    }
    fetch(RENDER_URL + '/health')
      .then(res => res.json())
      .then(data => console.log('✅ Keep-alive ping successful:', data.timestamp))
      .catch(err => console.error('❌ Keep-alive ping failed:', err.message));

  }, 14 * 60 * 1000); // every 14 minutes
}

// ========================================
// Auto-Cleanup for Old Events
// ========================================
function cleanupOldEvents() {
  const now = new Date();
  const events = getAllEvents();
  let cleanedCount = 0;
  
  for (const eventId in events) {
    const event = events[eventId];
    
    // Check if this is a "Play Now" event or a planned event
    if (event.type === 'now' || event.type === 'planned') {
      let eventTime;
      
      if (event.type === 'planned' && event.time) {
        const parsed = chrono.parse(event.time, new Date(), { timezone: 'PST' });
        if (parsed && parsed.length > 0) {
          eventTime = parsed[0].start.date();
        }
      } else if (event.type === 'now') {
        // Use creation time for "now" events
        eventTime = new Date(event.time || event.createdAt);
      }
      
      if (eventTime) {
        // Check if event is older than 30 minutes
        const eventEndTime = new Date(eventTime.getTime() + 30 * 60 * 1000);
        
        if (eventEndTime <= now) {
          console.log(`🧹 Auto-cleaning old event #${eventId} (${event.type})`);
          
          // Process non-responders BEFORE deleting
          const nonResponderAchievements = processEventNonResponders(event);
          
          // Log if any achievements were awarded
          if (nonResponderAchievements.length > 0) {
            console.log(`👻 Cloak's Shadow progress tracked for ${nonResponderAchievements.length} non-responder(s) on event #${eventId}`);
            
            // Send achievement notifications if bot is ready
            nonResponderAchievements.forEach(({ userId, achievements }) => {
              achievements.forEach(achievement => {
                console.log(`  ✨ User ${userId} unlocked ${achievement.emoji} ${achievement.name}!`);
              });
            });
          }
          
          // Clean up the event
          cancelReminder(eventId);
          clearEventCredits(eventId);
          deleteEvent(eventId);
          cleanedCount++;
        }
      }
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`✅ Cleaned up ${cleanedCount} old event(s)`);
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupOldEvents, 5 * 60 * 1000);

// Start keep-alive after bot is ready
client.once('clientReady', () => {
  keepAlive();
  console.log('🔄 Keep-alive service started');
  console.log('🧹 Auto-cleanup service started (runs every 5 minutes)');
  
  // Run cleanup immediately on startup
  cleanupOldEvents();
});
