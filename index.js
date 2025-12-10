require('dotenv').config();
const { Collection, MessageFlags, InteractionType, InteractionResponseType } = require('discord.js');
const express = require('express');
const { verifyKeyMiddleware } = require('discord-interactions');
const fs = require('fs');
const path = require('path');
const { getAllEvents, deleteEvent } = require('./utils/eventManager');
const { processEventNonResponders, clearEventCredits } = require('./utils/achievementManager');
const { getPendingReminders, markReminderSent, cleanupOrphanedReminders } = require('./utils/supabaseClient');
const { DateTime } = require('luxon');

console.log('🚀 Starting Marveling Bot (HTTP-only mode, no Gateway)...');

// ========================================
// Express Server (HTTP Interactions Endpoint)
// ========================================
const app = express();
const PORT = process.env.PORT || 3000;

console.log("🔵 Startup: file loaded");

// Track last request time (for idle logging)
let lastRequestTime = Date.now();

// Debounce for /check-reminders endpoint (prevent concurrent requests)
let isProcessingReminders = false;
let lastReminderCheck = 0;
const REMINDER_CHECK_COOLDOWN = 5000; // 5 seconds cooldown between checks

// Middleware to log all requests and update last request time
app.use((req, res, next) => {
  lastRequestTime = Date.now();
  // Don't log /check-reminders to prevent cron "output too large" error
  if (req.path !== '/check-reminders') {
    const timestamp = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' });
    console.log(`📨 [${timestamp} PST] ${req.method} ${req.path}`);
  }
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('🤖 Marveling Bot is awake and running!');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint to see all reminders in Supabase
app.get('/debug-reminders', async (req, res) => {
  const { getSupabaseClient } = require('./utils/supabaseClient');
  const client = getSupabaseClient();
  
  if (!client) {
    return res.json({ error: 'Supabase not configured' });
  }
  
  try {
    const { data, error } = await client
      .from('reminders')
      .select('*')
      .order('reminder_time', { ascending: true });
    
    if (error) throw error;
    
    const now = new Date();
    res.json({
      currentTime: now.toISOString(),
      lookAheadTo: new Date(now.getTime() + 20 * 60 * 1000).toISOString(),
      remindersInDatabase: data || [],
      count: data?.length || 0
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// ========================================
// Reminder Checking Endpoint (Called by Cron)
// ========================================
app.get('/check-reminders', async (req, res) => {
  // Return immediately to prevent timeout
  res.status(200).send("pick your hero or villain, i'm not judging");
  
  // Debounce: prevent concurrent requests
  const now = Date.now();
  if (isProcessingReminders || (now - lastReminderCheck < REMINDER_CHECK_COOLDOWN)) {
    return; // Already processing or too soon
  }
  
  isProcessingReminders = true;
  lastReminderCheck = now;
  
  // Process reminders asynchronously using Discord API (no gateway)
  (async () => {
    try {
      const pendingReminders = await getPendingReminders();
      
      if (pendingReminders.length === 0) {
        isProcessingReminders = false;
        return;
      }

      const currentTime = new Date();

      // Process each reminder using Discord REST API
      for (const reminder of pendingReminders) {
        try {
          const reminderTime = new Date(reminder.reminder_time);
          
          if (reminderTime > currentTime) {
            continue; // Not due yet, skip
          }

          // Format attendee mentions
          const attendeeMentions = reminder.attendees && reminder.attendees.length > 0
            ? reminder.attendees.map(id => `<@${id}>`).join(' ')
            : 'Everyone';

          // Random reminder messages
          const reminderMessages = [
            { title: '⚡ Get on soon!', desc: 'Game night starts in **~25 minutes!**' },
            { title: '🎮 Start updating!', desc: 'Make sure your game is up to date!' },
            { title: '🦸 Get ready to play!', desc: 'Suit up! Game time in **~25 minutes!**' },
            { title: '🔥 Almost time!', desc: 'Game night kicks off in **~25 minutes!**' },
            { title: '💥 Heads up!', desc: "We're playing in **~25 minutes!**" },
            { title: '🎯 Game time approaching!', desc: 'Lock in! Game starts soon!' },
            { title: '⚔️ Assemble soon!', desc: 'Heroes needed in **~25 minutes!**' }
          ];
          const randomMsg = reminderMessages[Math.floor(Math.random() * reminderMessages.length)];

          // Send via Discord REST API (no client needed)
          const { EmbedBuilder } = require('discord.js');
          const embed = new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle(randomMsg.title)
            .setDescription(randomMsg.desc)
            .setImage('https://giffiles.alphacoders.com/223/223284.gif')
            .addFields({ name: 'Event ID', value: `#${reminder.event_id}` });

          await fetch(`https://discord.com/api/v10/channels/${reminder.channel_id}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
            },
            body: JSON.stringify({
              content: `⏰ ${attendeeMentions}`,
              embeds: [embed.toJSON()],
              allowed_mentions: { parse: ['users'] }
            })
          });

          await markReminderSent(reminder.id);
        } catch (error) {
          // Silently skip failed reminders
          await markReminderSent(reminder.id);
        }
      }
    } catch (error) {
      // Silent error handling
    } finally {
      isProcessingReminders = false;
    }
  })();
});

// Load commands
const commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.set(command.data.name, command);
}

console.log(`✅ Loaded ${commands.size} command(s)`);

// Run startup tasks (gateway-free)
(async () => {
  try {
    console.log('🧹 Running startup cleanup...');
    await cleanupOldEvents();
    await cleanupOrphanedReminders();
    console.log('✅ Startup cleanup completed');
  } catch (error) {
    console.error('❌ Error in startup tasks:', error);
  }
})();

// ========================================
// Discord Interactions Endpoint (HTTP)
// ========================================
app.post('/interactions', verifyKeyMiddleware(process.env.DISCORD_PUBLIC_KEY), async (req, res) => {
  const interaction = req.body;
  
  // Handle PING from Discord
  if (interaction.type === InteractionType.Ping) {
    // [HTTP] PING from Discord (captured by cron if happens during cron)
    //console.log('✅ Received PING from Discord');
    return res.json({ type: InteractionResponseType.Pong });
  }
  
  // Handle Application Commands
  if (interaction.type === InteractionType.ApplicationCommand) {
    const commandName = interaction.data.name;
    const command = commands.get(commandName);
    
    // [HTTP] Command received (captured by cron if command runs during cron)
    //console.log(`📥 Received command: /${commandName}`);
    
    if (!command) {
      return res.json({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: '❌ Unknown command',
          flags: MessageFlags.Ephemeral
        }
      });
    }
    
    try {
      // Create a mock interaction object that works with existing command handlers (no client needed)
      const mockInteraction = {
        ...interaction,
        isChatInputCommand: () => true,
        commandName: commandName,
        options: {
          getString: (name) => {
            const option = interaction.data.options?.find(opt => opt.name === name);
            return option?.value || null;
          },
          getUser: (name) => {
            const option = interaction.data.options?.find(opt => opt.name === name);
            if (!option?.value) return null;
            
            // Check if user data is in resolved data
            const resolved = interaction.data.resolved;
            if (resolved?.users?.[option.value]) {
              return resolved.users[option.value];
            }
            
            // Fallback - return object with ID
            return { id: option.value };
          },
          getMentionable: (name) => {
            const option = interaction.data.options?.find(opt => opt.name === name);
            if (!option?.value) return null;
            
            // Mentionable can be a user or role
            const resolved = interaction.data.resolved;
            
            // Check if it's a user
            if (resolved?.users?.[option.value]) {
              const userData = resolved.users[option.value];
              const memberData = resolved.members?.[option.value];
              return {
                id: option.value,
                user: userData,
                member: memberData
              };
            }
            
            // Fallback - just return an object with the ID
            return { id: option.value, user: { id: option.value } };
          },
          getInteger: (name) => {
            const option = interaction.data.options?.find(opt => opt.name === name);
            return option?.value || null;
          },
          getBoolean: (name) => {
            const option = interaction.data.options?.find(opt => opt.name === name);
            return option?.value || null;
          }
        },
        guild: { id: interaction.guild_id },
        channel: { id: interaction.channel_id },
        guild_id: interaction.guild_id,
        user: interaction.member?.user || interaction.user,
        member: interaction.member,
        replied: false,
        deferred: false,
        reply: async (replyData) => {
          if (mockInteraction.replied || mockInteraction.deferred) {
            // Use followUp for already replied interactions
            const response = await fetch(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
              },
              body: JSON.stringify({
                content: replyData.content,
                embeds: replyData.embeds,
                flags: replyData.flags,
                components: replyData.components
              })
            });
            return response.json();
          }
          
          mockInteraction.replied = true;
          res.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: replyData.content,
              embeds: replyData.embeds,
              flags: replyData.flags,
              components: replyData.components
            }
          });
          
          // Return an object with fetch() method to retrieve the message
          return {
            fetch: async () => {
              // Fetch the original interaction response message
              const response = await fetch(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
                method: 'GET',
                headers: { 
                  'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
                }
              });
              const messageData = await response.json();
              
              // Return a message-like object that can be used with collectors
              // Since the message is ephemeral, we need to use the channel to create collectors
              return channel;
            }
          };
        },
        editReply: async (replyData) => {
          const response = await fetch(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
            method: 'PATCH',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
            },
            body: JSON.stringify({
              content: replyData.content,
              embeds: replyData.embeds,
              components: replyData.components
            })
          });
          return response.json();
        },
        deferReply: async (options = {}) => {
          mockInteraction.deferred = true;
          res.json({
            type: InteractionResponseType.DeferredChannelMessageWithSource,
            data: {
              flags: options.flags
            }
          });
        },
        followUp: async (replyData) => {
          const response = await fetch(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
            },
            body: JSON.stringify({
              content: replyData.content,
              embeds: replyData.embeds,
              flags: replyData.flags,
              components: replyData.components
            })
          });
          return response.json();
        }
      };
      
      // Execute the command (no client needed)
      await command.execute(mockInteraction);
      
      // If no reply was sent yet, send a default acknowledgment
      if (!mockInteraction.replied && !mockInteraction.deferred) {
        res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: '✅ Command executed',
            flags: MessageFlags.Ephemeral
          }
        });
      }
      
    } catch (error) {
      // [HTTP] Command execution error (captured by cron)
      //console.error('❌ Error executing command:', error);
      
      if (!res.headersSent) {
        return res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: '❌ Error running command: ' + error.message,
            flags: MessageFlags.Ephemeral
          }
        });
      }
    }
  }
  
  // Handle Message Component interactions (buttons, select menus, etc.)
  if (interaction.type === InteractionType.MessageComponent) {
    const buttonId = interaction.data.custom_id;
    // [HTTP] Button received (captured by cron if button pressed during cron)
    //console.log(`🔘 Received button: ${buttonId}`);
    
    try {
      // Create a mock interaction for button handling (no client needed)
      const mockInteraction = {
        ...interaction,
        user: interaction.member?.user || interaction.user,
        member: interaction.member,
        guild_id: interaction.guild_id,
        channel_id: interaction.channel_id,
        replied: false,
        deferred: false,
        deferUpdate: async () => {
          mockInteraction.deferred = true;
          res.json({
            type: InteractionResponseType.DeferredMessageUpdate
          });
        },
        update: async (replyData) => {
          mockInteraction.replied = true;
          res.json({
            type: InteractionResponseType.UpdateMessage,
            data: {
              content: replyData.content,
              embeds: replyData.embeds,
              components: replyData.components,
              flags: replyData.flags
            }
          });
        },
        reply: async (replyData) => {
          mockInteraction.replied = true;
          res.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: replyData.content,
              embeds: replyData.embeds,
              components: replyData.components,
              flags: replyData.flags
            }
          });
        },
        editReply: async (replyData) => {
          const response = await fetch(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
            method: 'PATCH',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
            },
            body: JSON.stringify({
              content: replyData.content,
              embeds: replyData.embeds,
              components: replyData.components
            })
          });
          return response.json();
        }
      };

      // Handle RSVP button interactions
      if (buttonId.startsWith('rsvp_')) {
        const { getEvent, addAttendee, removeAttendee } = require('./utils/eventManager');
        const { trackRSVP, trackMaybe, trackFastRSVP, trackWorthyEvent, checkAvengersAssemble } = require('./utils/achievementManager');
        
        const parts = buttonId.split('_');
        const action = parts[1]; // yes, maybe, no, reschedule
        const eventId = parts[2];
        
        const event = getEvent(eventId);
        if (!event) {
          return mockInteraction.reply({
            content: '❌ Event not found or has been deleted.',
            flags: MessageFlags.Ephemeral
          });
        }
        
        const userId = mockInteraction.user.id;
        const achievements = [];
        
        if (action === 'yes') {
          addAttendee(eventId, userId);
          
          // Track RSVP achievement (only for Available) - pass eventId to prevent farming
          const rsvpAchievements = await trackRSVP(userId, eventId);
          achievements.push(...rsvpAchievements);
          
          // Check for fast RSVP (within 30 seconds, not your own event)
          if (event && userId !== event.creatorId) {
            const timeSinceCreation = (Date.now() - event.createdAt) / 1000; // seconds
            if (timeSinceCreation <= 30) {
              const bullseyeAchievements = await trackFastRSVP(userId, eventId);
              achievements.push(...bullseyeAchievements);
            }
          }
          
          // Check for Worthy achievement (5+ RSVPs on host's event)
          if (event && event.attendees.length >= 5) {
            const worthyAchievements = await trackWorthyEvent(event.creatorId);
            if (worthyAchievements.length > 0) {
              const worthyText = worthyAchievements.map(a => `<@${event.creatorId}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
              // Send via REST API
              await fetch(`https://discord.com/api/v10/channels/${mockInteraction.channel_id}/messages`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
                },
                body: JSON.stringify({ content: worthyText })
              }).catch(() => {});
            }
          }
          
          // Check for Avengers Assemble achievement (everyone RSVPs)
          if (event) {
            const avengersAchievements = await checkAvengersAssemble(event);
            if (avengersAchievements.length > 0) {
              const avengersText = avengersAchievements.map(({ userId, achievements }) => 
                achievements.map(a => `<@${userId}> unlocked ${a.emoji} **${a.name}**!`).join('\n')
              ).join('\n');
              // Send via REST API
              await fetch(`https://discord.com/api/v10/channels/${mockInteraction.channel_id}/messages`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
                },
                body: JSON.stringify({ content: avengersText })
              }).catch(() => {});
            }
          }
          
          await mockInteraction.reply({
            content: `✅ You're in for event #${eventId}!`,
            flags: MessageFlags.Ephemeral
          });
        } 
        else if (action === 'maybe') {
          // Track Maybe responses - pass eventId to prevent farming
          const maybeAchievements = await trackMaybe(userId, eventId);
          achievements.push(...maybeAchievements);
          
          await mockInteraction.reply({
            content: `🤔 Marked as maybe for event #${eventId}`,
            flags: MessageFlags.Ephemeral
          });
        }
        else if (action === 'no') {
          removeAttendee(eventId, userId);
          
          await mockInteraction.reply({
            content: `❌ You won't be attending event #${eventId}`,
            flags: MessageFlags.Ephemeral
          });
        }
        else if (action === 'reschedule') {
          // Only creator can reschedule
          if (userId !== event.creatorId) {
            return mockInteraction.reply({
              content: '🚫 Only the event creator can reschedule.',
              flags: MessageFlags.Ephemeral
            });
          }
          
          return mockInteraction.reply({
            content: '🔁 To reschedule, use the `/reschedule` command with the event ID and new time.',
            flags: MessageFlags.Ephemeral
          });
        }
        
        // Send achievement notifications via REST API
        if (achievements.length > 0) {
          const achievementText = achievements.map(a => `<@${userId}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
          await fetch(`https://discord.com/api/v10/channels/${mockInteraction.channel_id}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
            },
            body: JSON.stringify({ content: achievementText })
          }).catch(() => {});
        }
      }
      // Add more button handlers here for other commands
      
      // If no handler replied, send a default response
      if (!mockInteraction.replied && !mockInteraction.deferred) {
        res.json({
          type: InteractionResponseType.UpdateMessage,
          data: {
            content: '✅ Button pressed',
            components: []
          }
        });
      }

    } catch (error) {
      // [HTTP] Button handling error (captured by cron)
      //console.error('❌ Error handling button:', error);
      
      if (!res.headersSent) {
        return res.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: '❌ Error handling button: ' + error.message,
            flags: MessageFlags.Ephemeral
          }
        });
      }
    }
  }
});

app.listen(PORT, () => {
  // [STARTUP] HTTP server started
  //console.log(`🌐 HTTP server running on port ${PORT}`);
  // [STARTUP] Interactions endpoint ready
  //console.log(`📡 Interactions endpoint: /interactions`);
});

// Log when process is shutting down (bot going to sleep)
process.on('SIGTERM', () => {
  // [SLEEP] Bot going to sleep
  console.log('😴 SIGTERM received - Bot going to sleep...');
  process.exit(0);
});

process.on('SIGINT', () => {
  // [SLEEP] Bot going to sleep
  //console.log('😴 SIGINT received - Bot going to sleep...');
  process.exit(0);
});

// Log periodic heartbeat to show bot is still awake
setInterval(() => {
  const minutesSinceLastRequest = Math.floor((Date.now() - lastRequestTime) / 60000);
  if (minutesSinceLastRequest >= 5) {
    // [SLEEP] Bot idle heartbeat
    //console.log(`💤 Bot still awake but idle for ${minutesSinceLastRequest} minute(s)...`);
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// ========================================
// Sleep Schedule (2am-10am PST to save Railway credits)
// ========================================
function checkSleepSchedule() {
  const now = new Date();
  const pstTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const hour = now.getHours();   // 0-23 in local server time
  const minute = now.getMinutes();

  // if ((hour === 3 && minute >= 30) || (hour === 9 && minute < 30)) {
  //   console.log(`😴 Sleep time (${hour}:${minute} PST). Shutting down to save credits...`);
  //   console.log('💾 All data has been saved to disk and will persist on restart.');
  //   console.log('⏰ Bot will wake up at 9:20 PM PST.');
  //   process.exit(0); // Graceful shutdown
  // }
}

// Check sleep schedule on startup
checkSleepSchedule();

// Check every 5 minutes if it's time to sleep
setInterval(checkSleepSchedule, 5 * 60 * 1000);

// ========================================
// Auto-Cleanup for Old Events (Gateway-Free)
// ========================================
async function cleanupOldEvents() {
  const now = DateTime.now().setZone('America/Los_Angeles');
  const events = getAllEvents();
  let cleanedCount = 0;
  
  for (const eventId in events) {
    const event = events[eventId];
    
    // Check if this is a "Play Now" event or a planned event
    if (event.type === 'now' || event.type === 'planned') {
      let eventTime;
      
      if (event.type === 'planned') {
        // ✅ Use stored ISO timestamps (reliable)
        if (event.eventTimeIso) {
          eventTime = DateTime.fromISO(event.eventTimeIso, { zone: 'America/Los_Angeles' });
        } else if (event.reminderTime) {
          const reminderTime = DateTime.fromISO(event.reminderTime, { zone: 'America/Los_Angeles' });
          eventTime = reminderTime.plus({ minutes: 25 });
        }
      } else if (event.type === 'now') {
        // Use creation time for "now" events
        eventTime = DateTime.fromJSDate(new Date(event.time || event.createdAt)).setZone('America/Los_Angeles');
      }
      
      if (eventTime) {
        // Check if event ended more than 30 minutes ago
        const eventEndTime = eventTime.plus({ minutes: 30 });
        
        if (eventEndTime <= now) {
          // Process non-responders BEFORE deleting
          await processEventNonResponders(event);
          
          // Clean up the event
          await clearEventCredits(eventId);
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
setInterval(() => {
  cleanupOldEvents().catch(() => {});
}, 5 * 60 * 1000);
