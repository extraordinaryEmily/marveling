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

// Test WebSocket connectivity to Discord Gateway
console.log('🔌 Testing WebSocket connectivity to Discord Gateway...');
try {
  let WebSocket;
  try {
    WebSocket = require('ws');
    console.log('✅ WebSocket module loaded');
  } catch (wsError) {
    console.log('⚠️ ws module not found, trying to use from discord.js...');
    // Try to get ws from discord.js dependencies
    try {
      const discordJsPath = require.resolve('discord.js');
      const discordJsDir = require('path').dirname(discordJsPath);
      WebSocket = require(require('path').join(discordJsDir, '../ws'));
    } catch (e) {
      console.error('❌ Could not load WebSocket module:', e.message);
      WebSocket = null;
    }
  }
  
  if (WebSocket) {
    console.log('🔌 Creating WebSocket connection to Discord Gateway...');
    const ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
    
    ws.on('open', () => {
      console.log('✅ WebSocket OPENED - Network connectivity OK');
      ws.close();
    });
    
    ws.on('message', (msg) => {
      const msgStr = msg.toString();
      console.log('📨 WS MESSAGE (first 200 chars):', msgStr.substring(0, 200));
    });
    
    ws.on('error', (err) => {
      console.error('❌ WS ERROR:', err.message);
      console.error('❌ WS ERROR CODE:', err.code);
      console.error('❌ WS ERROR TYPE:', err.type);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`🔌 WebSocket CLOSED - Code: ${code}, Reason: ${reason ? reason.toString() : 'none'}`);
    });
    
    // Timeout after 5 seconds
    setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        console.log('⏰ WebSocket test timeout (5s) - connection still pending');
        console.log('⏰ WebSocket readyState:', ws.readyState);
        ws.close();
      }
    }, 5000);
  } else {
    console.log('⚠️ Skipping WebSocket test - module not available');
  }
} catch (error) {
  console.error('❌ Failed to test WebSocket:', error.message);
  console.error('❌ Error stack:', error.stack);
}

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
  
  // Process reminders asynchronously (after response sent)
  (async () => {
    try {
      // Wait for client to be ready (with shorter timeout)
      if (!client.isReady()) {
        await new Promise((resolve) => {
          if (client.isReady()) return resolve();
          const timeout = setTimeout(() => resolve(), 5000); // 5 sec timeout
          client.once('ready', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }

      if (!client.isReady()) {
        isProcessingReminders = false;
        return; // Client not ready, skip this check
      }

      const pendingReminders = await getPendingReminders();
      
      if (pendingReminders.length === 0) {
        isProcessingReminders = false;
        return;
      }

      const currentTime = new Date();

      // Process each reminder
      for (const reminder of pendingReminders) {
        try {
          const reminderTime = new Date(reminder.reminder_time);
          
          if (reminderTime > currentTime) {
            continue; // Not due yet, skip
          }
          
          const channel = await client.channels.fetch(reminder.channel_id);
          
          if (!channel) {
            await markReminderSent(reminder.id);
            continue;
          }

          // Format attendee mentions
          const attendeeMentions = reminder.attendees && reminder.attendees.length > 0
            ? reminder.attendees.map(id => `<@${id}>`).join(' ')
            : 'Everyone';

          // Random reminder messages (same as helper.js)
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

          const { EmbedBuilder } = require('discord.js');
          const embed = new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle(randomMsg.title)
            .setDescription(randomMsg.desc)
            .setImage('https://giffiles.alphacoders.com/223/223284.gif')
            .addFields({ name: 'Event ID', value: `#${reminder.event_id}` });

          // Send the reminder with embed
          await channel.send({
            content: `⏰ ${attendeeMentions}`,
            embeds: [embed],
            allowedMentions: { parse: ['users'] }
          });

          await markReminderSent(reminder.id);
        } catch (error) {
          // Silently skip failed reminders
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

// Set up ready event listener BEFORE login (critical!)
console.log('🔧 Setting up ready event listener...');
console.log('🔧 Event listeners before setup:', client.listenerCount('ready'));

client.once('ready', () => {
  console.log('🟢 ONCE READY HANDLER FIRED!');
  // Log immediately - don't wait for async code
  console.log(`🎉 Discord client ready as ${client.user.tag}`);
  console.log(`🎉 Bot ID: ${client.user.id}`);
  console.log(`🎉 Bot username: ${client.user.username}`);
  console.log(`🎉 Bot discriminator: ${client.user.discriminator}`);
  console.log(`🎉 Client uptime: ${client.uptime}ms`);
  console.log(`🎉 WS status: ${client.ws?.status}`);
  console.log(`🎉 WS ping: ${client.ws?.ping}ms`);
  
  // Run async startup code in background (don't await)
  (async () => {
    try {
      console.log('🚀 Starting async startup services...');
      // [STARTUP] Auto-cleanup service started
      //console.log('🧹 Auto-cleanup service started (runs every 5 minutes)');
      // [STARTUP] Message listener active
      //console.log('📨 Message listener active for multi-step commands');
      
      // Run cleanup immediately on startup
      cleanupOldEvents().catch(() => {});
      
      // Clean up orphaned reminders in Supabase (reminders for deleted events)
      await cleanupOrphanedReminders();
      
      // Recreate any reminders from saved events
      recreateReminders();
      console.log('✅ Async startup services completed');
    } catch (error) {
      // Log but don't block - bot is still ready
      console.error('❌ Error in startup services:', error);
      console.error('❌ Error stack:', error.stack);
    }
  })();
});

// Also listen for ready with 'on' to catch if 'once' doesn't work
client.on('ready', () => {
  console.log('🟢 ON READY HANDLER FIRED!');
  console.log('🟢 Ready event fired (on listener)');
  console.log('🟢 Client user:', client.user?.tag || 'null');
});

console.log('✅ Ready listeners set up. Count:', client.listenerCount('ready'));

// Login to Discord (for API access)
console.log('🔐 Attempting to login to Discord...');
console.log('🔑 Token exists:', !!process.env.DISCORD_TOKEN);
console.log('🔑 Token length:', process.env.DISCORD_TOKEN?.length || 0);
console.log('🔑 Token preview:', process.env.DISCORD_TOKEN?.substring(0, 10) + '...' || 'null');
console.log('🔑 Node version:', process.version);
console.log('🔑 Platform:', process.platform);
console.log('🔑 Arch:', process.arch);

// Log client state before login
console.log('📊 Pre-login client state:', {
  isReady: client.isReady(),
  user: client.user?.tag || 'null',
  wsStatus: client.ws?.status || 'null',
  listenerCount: client.listenerCount('ready')
});

// Set a timeout to detect if login hangs
const loginTimeout = setTimeout(() => {
  console.log('⏰ Login timeout (10s) - checking client state...');
  console.log('⏰ Client ready?', client.isReady());
  console.log('⏰ Client user?', client.user?.tag || 'null');
  console.log('⏰ WS status?', client.ws?.status || 'null');
  console.log('⏰ WS ping?', client.ws?.ping || 'null');
  console.log('⏰ Ready listeners?', client.listenerCount('ready'));
}, 10000); // 10 second timeout

console.log('🚀 Calling client.login()...');
const loginPromise = client.login(process.env.DISCORD_TOKEN);

console.log('📝 Login promise created, waiting for resolution...');

loginPromise
  .then(() => {
    clearTimeout(loginTimeout);
    console.log('✅ Login promise RESOLVED');
    console.log('✅ Client ready state:', client.isReady());
    console.log('✅ Client user:', client.user?.tag || 'null');
    console.log('✅ WS status:', client.ws?.status || 'null');
    console.log('✅ WS ping:', client.ws?.ping || 'null');
  })
  .catch(err => {
    clearTimeout(loginTimeout);
    // [STARTUP] Discord login failed
    console.error('❌ Login promise REJECTED');
    console.error('❌ Failed to login to Discord:', err);
    console.error('❌ Error name:', err.name);
    console.error('❌ Error message:', err.message);
    console.error('❌ Error code:', err.code);
    console.error('❌ Error stack:', err.stack);
  });

// Also listen for error events
client.on('error', (error) => {
  console.error('❌ Discord client ERROR event:', error);
  console.error('❌ Error name:', error.name);
  console.error('❌ Error message:', error.message);
  console.error('❌ Error stack:', error.stack);
});

client.on('warn', (warning) => {
  console.warn('⚠️ Discord client WARN event:', warning);
});

client.on('disconnect', (event) => {
  console.log('🔌 Discord client DISCONNECT event');
  console.log('🔌 Close code:', event.code);
  console.log('🔌 Close reason:', event.reason);
});

client.on('reconnecting', () => {
  console.log('🔄 Discord client RECONNECTING event');
});

client.on('shardReady', (id) => {
  console.log(`🟢 Shard READY event - Shard ID: ${id}`);
});

client.on('shardError', (error, id) => {
  console.error(`❌ Shard ERROR event - Shard ID: ${id}`, error);
});

client.on('shardDisconnect', (event, id) => {
  console.log(`🔌 Shard DISCONNECT event - Shard ID: ${id}`, event.code);
});

client.on('shardReconnecting', (id) => {
  console.log(`🔄 Shard RECONNECTING event - Shard ID: ${id}`);
});

// Log when WebSocket opens
if (client.ws) {
  console.log('📡 WebSocket manager exists');
} else {
  console.log('⚠️ WebSocket manager does not exist yet');
}

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
      // Wait for client to be ready (with timeout)
      if (!client.isReady()) {
        //console.log('⏳ Waiting for Discord client to be ready...');
        const ready = await Promise.race([
          new Promise((resolve) => {
            if (client.isReady()) return resolve(true);
            client.once('ready', () => resolve(true));
          }),
          new Promise((resolve) => setTimeout(() => resolve(false), 30000)) // 30 sec timeout
        ]);
        
        if (!ready) {
          //console.error('❌ Client not ready after 30 seconds');
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
        client: client, // Add client for commands that need it
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
      // Wait for client to be ready (with timeout)
      if (!client.isReady()) {
        // [HTTP] Waiting for client ready (button handler) (captured by cron)
        //console.log('⏳ Waiting for Discord client to be ready...');
        const ready = await Promise.race([
          new Promise((resolve) => {
            if (client.isReady()) return resolve(true);
            client.once('ready', () => resolve(true));
          }),
          new Promise((resolve) => setTimeout(() => resolve(false), 30000)) // 30 sec timeout
        ]);
        
        if (!ready) {
          // [HTTP] Client ready timeout (button handler) (captured by cron)
          //console.error('❌ Client not ready after 30 seconds');
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
// Auto-Cleanup for Old Events
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
          // [CLEANUP] Auto-cleaning old event
          //console.log(`🧹 Auto-cleaning old event #${eventId} (${event.type})`);
          
          // Process non-responders BEFORE deleting
          const nonResponderAchievements = await processEventNonResponders(event);
          
          // Log if any achievements were awarded
          if (nonResponderAchievements.length > 0) {
            // [CLEANUP] Achievement tracking
            //console.log(`👻 Cloak's Shadow progress tracked for ${nonResponderAchievements.length} non-responder(s) on event #${eventId}`);
            
            // Send achievement notifications if bot is ready
            nonResponderAchievements.forEach(({ userId, achievements }) => {
              achievements.forEach(achievement => {
                // [CLEANUP] Achievement unlocked
                //console.log(`  ✨ User ${userId} unlocked ${achievement.emoji} ${achievement.name}!`);
              });
            });
          }
          
          // Clean up the event
          cancelReminder(eventId);
          await clearEventCredits(eventId);
          deleteEvent(eventId);
          cleanedCount++;
        }
      }
    }
  }
  
  if (cleanedCount > 0) {
    // [CLEANUP] Cleanup summary
    //console.log(`✅ Cleaned up ${cleanedCount} old event(s)`);
  }
}

// Run cleanup every 5 minutes
setInterval(() => {
  cleanupOldEvents().catch(() => {});
}, 5 * 60 * 1000);

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
            // [CLEANUP] Channel not found warning
            //console.warn(`⚠️ Channel ${event.channelId} not found for event #${eventId}`);
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
          // [CLEANUP] Reminder recreated
          console.log(`⏰ Recreated reminder for event #${eventId} (fires in ${minsUntil} minutes)`);
        } else {
          // [CLEANUP] Expired reminder skipped
          console.log(`⏭️  Skipped expired reminder for event #${eventId}`);
        }
      } catch (err) {
        // [CLEANUP] Error recreating reminder
        //console.error(`❌ Error recreating reminder for event #${eventId}:`, err);
      }
    }
  }
  
  if (recreatedCount > 0) {
    // [CLEANUP] Reminders recreated summary
    //console.log(`✅ Recreated ${recreatedCount} reminder(s) from saved data`);
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
    // [MESSAGE_HANDLER] Error handling message
    //console.error('❌ Error handling message for command:', error);
  }
});
