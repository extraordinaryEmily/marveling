require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Partials, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');

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
    // Ping every 14 minutes (840000 ms)
    // Log the time left for each event's reminder
    const now = new Date();
    const events = getAllEvents();
    for (const eventId in events) {
      const event = events[eventId];
      if (event.reminderTimeoutId) {
        const reminderTime = new Date(event.reminderTimeoutId);
        const timeLeft = reminderTime.getTime() - now.getTime();
        console.log(`Event ${eventId} reminder in ${timeLeft}ms`);
      }
    }
    
    // Log the active events
    const activeEventIds = Object.keys(events).filter(id => {
      const event = events[id];
      return event.reminderTimeoutId || event.type === 'now';
    });
    console.log(`Active events: ${activeEventIds.join(', ')}`);
    
    fetch(RENDER_URL + '/health')
      .then(res => res.json())
      .then(data => console.log('✅ Keep-alive ping successful:', data.timestamp))
      .catch(err => console.error('❌ Keep-alive ping failed:', err.message));
  }, 14 * 60 * 1000); // 14 minutes
}

// Start keep-alive after bot is ready
client.once('clientReady', () => {
  keepAlive();
  console.log('🔄 Keep-alive service started');
});
