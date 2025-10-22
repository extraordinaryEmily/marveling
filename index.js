require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Partials, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { getAllEvents, deleteEvent, cancelReminder, setReminder } = require('./utils/eventManager');
const { processEventNonResponders, clearEventCredits } = require('./utils/achievementManager');
const chrono = require('chrono-node');
const { DateTime } = require('luxon');

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

// ========================================
// Sleep Schedule (2am-10am PST to save Railway credits)
// ========================================
function checkSleepSchedule() {
  const now = new Date();
  const pstTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const hour = pstTime.getHours();
  
  // Sleep between 2am and 10am PST
  if (hour >= 20 && hour < 21) { // TEST: 5pm-7pm PST
    console.log(`😴 Sleep time (${hour}:00 PST). Shutting down to save credits...`);
    console.log('💾 All data has been saved to disk and will persist on restart.');
    console.log('⏰ Bot will wake up at 10am PST when Railway restarts it.');
    process.exit(0); // Graceful shutdown - Railway will restart later
  }
}

// Check sleep schedule on startup
checkSleepSchedule();

// Check every 5 minutes if it's time to sleep
setInterval(checkSleepSchedule, 5 * 60 * 1000);

client.login(process.env.DISCORD_TOKEN);

// ========================================
// Auto-Cleanup for Old Events
// ========================================
function cleanupOldEvents() {
  const now = DateTime.now().setZone('America/Los_Angeles');
  const events = getAllEvents();
  let cleanedCount = 0;
  
  for (const eventId in events) {
    const event = events[eventId];
    
    // Check if this is a "Play Now" event or a planned event
    if (event.type === 'now' || event.type === 'planned') {
      let eventTime;
      
      if (event.type === 'planned') {
        // ✅ FIX: Use stored ISO timestamps (reliable) instead of re-parsing relative strings
        if (event.eventTimeIso) {
          // Primary: Use the stored absolute event time
          eventTime = DateTime.fromISO(event.eventTimeIso, { zone: 'America/Los_Angeles' });
        } else if (event.reminderTime) {
          // Fallback: Calculate from reminderTime (45 mins before event)
          const reminderTime = DateTime.fromISO(event.reminderTime, { zone: 'America/Los_Angeles' });
          eventTime = reminderTime.plus({ minutes: 45 });
        } else if (event.time) {
          // Last resort: parse the string (may be unreliable on restart)
          const parsed = chrono.parse(event.time, new Date(), { timezone: 'PST' });
          if (parsed && parsed.length > 0) {
            eventTime = DateTime.fromJSDate(parsed[0].start.date()).setZone('America/Los_Angeles');
          }
        }
      } else if (event.type === 'now') {
        // Use creation time for "now" events
        eventTime = DateTime.fromJSDate(new Date(event.time || event.createdAt)).setZone('America/Los_Angeles');
      }
      
      if (eventTime) {
        // Check if event ended more than 30 minutes ago
        const eventEndTime = eventTime.plus({ minutes: 30 });
        
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

// ========================================
// Recreate Reminders on Startup
// ========================================
function recreateReminders() {
  const now = DateTime.now().setZone('America/Los_Angeles');
  const events = getAllEvents();
  let recreatedCount = 0;
  
  for (const eventId in events) {
    const event = events[eventId];
    
    // If event has a reminderTime but no active timeout, recreate it
    if (event.reminderTime && !event.reminderTimeoutId && event.channelId) {
      try {
        const reminderTime = DateTime.fromISO(event.reminderTime, { zone: 'America/Los_Angeles' });
        const delayMs = reminderTime.diff(now).milliseconds;
        
        // Only recreate if reminder is in the future
        if (delayMs > 0) {
          const channel = client.channels.cache.get(event.channelId);
          if (!channel) {
            console.warn(`⚠️ Channel ${event.channelId} not found for event #${eventId}`);
            continue;
          }
          
          // Schedule the reminder
          const timeoutId = setTimeout(async () => {
            const event = getAllEvents()[eventId];
            if (!event) return;
            
            const attendeeMentions = event.attendees.map(id => `<@${id}>`).join(' ');
            await channel.send({
              content: `⏰ Time to play! ${attendeeMentions || 'Everyone'}`,
              allowedMentions: { parse: ['users'] }
            });
          }, delayMs);
          
          setReminder(eventId, timeoutId, event.channelId, event.messageId);
          recreatedCount++;
          
          const minsUntil = Math.round(delayMs / 60000);
          console.log(`⏰ Recreated reminder for event #${eventId} (fires in ${minsUntil} minutes)`);
        } else {
          console.log(`⏭️  Skipped expired reminder for event #${eventId}`);
        }
      } catch (err) {
        console.error(`❌ Error recreating reminder for event #${eventId}:`, err);
      }
    }
  }
  
  if (recreatedCount > 0) {
    console.log(`✅ Recreated ${recreatedCount} reminder(s) from saved data`);
  }
}

// Start services after bot is ready
client.once('clientReady', () => {
  console.log('🧹 Auto-cleanup service started (runs every 5 minutes)');
  
  // Run cleanup immediately on startup
  cleanupOldEvents();
  
  // Recreate any reminders from saved events
  recreateReminders();
});
