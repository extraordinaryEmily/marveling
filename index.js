require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Partials, MessageFlags, InteractionType, InteractionResponseType } = require('discord.js');
const express = require('express');
const { verifyKeyMiddleware } = require('discord-interactions');
const fs = require('fs');
const path = require('path');
const { getAllEvents, deleteEvent, cancelReminder, setReminder } = require('./utils/eventManager');
const { processEventNonResponders, clearEventCredits } = require('./utils/achievementManager');
const { getPendingReminders, markReminderSent, cleanupOrphanedReminders } = require('./utils/supabaseClient');
const chrono = require('chrono-node');
const { DateTime } = require('luxon');

// ========================================
// Express Server (HTTP Interactions Endpoint)
// ========================================
const app = express();
const PORT = process.env.PORT || 3000;

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
      lookAheadTo: new Date(now.getTime() + 6 * 60 * 1000).toISOString(),
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
  const now = new Date();
  const nowUTC = now.toISOString();
  const lookAhead = new Date(now.getTime() + 6 * 60 * 1000).toISOString();
  
  console.log(`⏰ Checking for pending reminders in Supabase...`);
  console.log(`   Current time (UTC): ${nowUTC}`);
  console.log(`   Looking ahead to: ${lookAhead}`);
  
  try {
    // Wait for client to be ready
    if (!client.isReady()) {
      console.log('⏳ Waiting for Discord client to be ready...');
      await new Promise((resolve) => {
        if (client.isReady()) return resolve();
        const timeout = setTimeout(() => resolve(), 10000); // 10 sec timeout
        client.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    // Get pending reminders from Supabase
    const pendingReminders = await getPendingReminders();
    
    if (pendingReminders.length === 0) {
      console.log('✅ No pending reminders found');
      return res.json({ 
        status: 'ok', 
        message: 'No pending reminders',
        checked: 0,
        sent: 0,
        currentTime: nowUTC,
        lookingAheadTo: lookAhead
      });
    }

    console.log(`📬 Found ${pendingReminders.length} pending reminder(s)`);
    let sentCount = 0;

    // Process each reminder
    for (const reminder of pendingReminders) {
      try {
        const channel = await client.channels.fetch(reminder.channel_id);
        
        if (!channel) {
          console.warn(`⚠️ Channel ${reminder.channel_id} not found for reminder ${reminder.id}`);
          await markReminderSent(reminder.id); // Mark as sent to avoid retry
          continue;
        }

        // Format attendee mentions
        const attendeeMentions = reminder.attendees && reminder.attendees.length > 0
          ? reminder.attendees.map(id => `<@${id}>`).join(' ')
          : 'Everyone';

        // Send the reminder
        await channel.send({
          content: `⏰ Time to play! ${attendeeMentions}`,
          allowedMentions: { parse: ['users'] }
        });

        // Mark as sent in Supabase
        await markReminderSent(reminder.id);
        
        console.log(`✅ Sent reminder for event #${reminder.event_id}`);
        sentCount++;
      } catch (error) {
        console.error(`❌ Failed to send reminder ${reminder.id}:`, error.message);
        // Don't mark as sent so it can retry
      }
    }

    res.json({ 
      status: 'ok', 
      checked: pendingReminders.length,
      sent: sentCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error checking reminders:', error);
    res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
  }
});

// Load commands
const commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.set(command.data.name, command);
}

// Initialize Discord client (for API calls, not Gateway)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = commands;

// Login to Discord (for API access)
client.login(process.env.DISCORD_TOKEN).then(() => {
  console.log(`✅ Discord client ready as ${client.user?.tag || 'Bot'}`);
}).catch(err => {
  console.error('❌ Failed to login to Discord:', err);
});

// ========================================
// Discord Interactions Endpoint (HTTP)
// ========================================
app.post('/interactions', verifyKeyMiddleware(process.env.DISCORD_PUBLIC_KEY), async (req, res) => {
  const interaction = req.body;
  
  // Handle PING from Discord
  if (interaction.type === InteractionType.Ping) {
    console.log('✅ Received PING from Discord');
    return res.json({ type: InteractionResponseType.Pong });
  }
  
  // Handle Application Commands
  if (interaction.type === InteractionType.ApplicationCommand) {
    const commandName = interaction.data.name;
    const command = commands.get(commandName);
    
    console.log(`📥 Received command: /${commandName}`);
    
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
      // Wait for client to be ready (with timeout)
      if (!client.isReady()) {
        console.log('⏳ Waiting for Discord client to be ready...');
        const ready = await Promise.race([
          new Promise((resolve) => {
            if (client.isReady()) return resolve(true);
            client.once('ready', () => resolve(true));
          }),
          new Promise((resolve) => setTimeout(() => resolve(false), 30000)) // 30 sec timeout
        ]);
        
        if (!ready) {
          console.error('❌ Client not ready after 30 seconds');
          return res.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: '❌ Bot is still starting up, please try again in a moment.',
              flags: MessageFlags.Ephemeral
            }
          });
        }
      }
      
      // Fetch guild and channel objects from cache
      const guild = await client.guilds.fetch(interaction.guild_id);
      const channel = await client.channels.fetch(interaction.channel_id);
      
      // Create a mock interaction object that works with existing command handlers
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
            return option?.value ? { id: option.value } : null;
          },
          getMentionable: (name) => {
            const option = interaction.data.options?.find(opt => opt.name === name);
            if (!option?.value) return null;
            
            // Mentionable can be a user or role
            // Discord sends the ID in the value, and the resolved data in interaction.data.resolved
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
            
            // Check if it's a role
            if (resolved?.roles?.[option.value]) {
              return guild.roles.cache.get(option.value);
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
        guild: guild,
        channel: channel,
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
      
      // Execute the command
      await command.execute(mockInteraction, client);
      
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
      console.error('❌ Error executing command:', error);
      
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
    console.log(`🔘 Received button: ${buttonId}`);
    
    try {
      // Wait for client to be ready (with timeout)
      if (!client.isReady()) {
        console.log('⏳ Waiting for Discord client to be ready...');
        const ready = await Promise.race([
          new Promise((resolve) => {
            if (client.isReady()) return resolve(true);
            client.once('ready', () => resolve(true));
          }),
          new Promise((resolve) => setTimeout(() => resolve(false), 30000)) // 30 sec timeout
        ]);
        
        if (!ready) {
          console.error('❌ Client not ready after 30 seconds');
          return res.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: '❌ Bot is still starting up, please try again in a moment.',
              flags: MessageFlags.Ephemeral
            }
          });
        }
      }

      // Create a mock interaction for button handling
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

      // Route to appropriate command handler
      if (buttonId.startsWith('create_')) {
        const createCommand = commands.get('create');
        if (createCommand && createCommand.handleButton) {
          await createCommand.handleButton(mockInteraction, client, buttonId);
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
      console.error('❌ Error handling button:', error);
      
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
  console.log(`🌐 HTTP server running on port ${PORT}`);
  console.log(`📡 Interactions endpoint: /interactions`);
});

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

// Handle messages for multi-step commands (like /create time input)
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  try {
    // Check if /create command is waiting for time input
    const createCommand = commands.get('create');
    if (createCommand && createCommand.handleTimeMessage) {
      const handled = await createCommand.handleTimeMessage(message, client);
      if (handled) return;
    }

    // Check if /reschedule command is waiting for time input
    const rescheduleCommand = commands.get('reschedule');
    if (rescheduleCommand && rescheduleCommand.handleTimeMessage) {
      const handled = await rescheduleCommand.handleTimeMessage(message, client);
      if (handled) return;
    }

    // Add more command message handlers here as needed
  } catch (error) {
    console.error('❌ Error handling message for command:', error);
  }
});

// Start services after bot is ready
client.once('clientReady', async () => {
  console.log('🧹 Auto-cleanup service started (runs every 5 minutes)');
  console.log('📨 Message listener active for multi-step commands');
  
  // Run cleanup immediately on startup
  cleanupOldEvents();
  
  // Clean up orphaned reminders in Supabase (reminders for deleted events)
  await cleanupOrphanedReminders();
  
  // Recreate any reminders from saved events
  recreateReminders();
});
