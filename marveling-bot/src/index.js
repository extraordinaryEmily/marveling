import nacl from 'tweetnacl';
import { createSupabaseClient } from './supabase.js';
import {
  trackHostCreated,
  trackInviteSent,
  trackRSVP,
  trackMaybe,
  trackFastRSVP,
  trackWorthyEvent,
  checkAvengersAssemble,
  checkMoonKnight,
  checkWakandaStrategist,
  trackHostWithTimestamp
} from './achievementManager.js';

// Discord public key from Developer Portal
const PUBLIC_KEY = '45fb54cedef58867541476ba64135e875eb033978056d762991ee86b10176484';

// Discord interaction types
const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
};

const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
};

const MessageFlags = {
  EPHEMERAL: 1 << 6, // 64
};

// Your bot application ID
const CLIENT_ID = '1424457717656977410'; // replace with your Discord bot client ID

async function sendFollowUp(applicationId, interactionToken, data) {
	// console.log(`Sending follow-up to token: ${interactionToken}`);
	console.log('Message data:', JSON.stringify(data, null, 2));
	try {
	  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`;
	  //console.log('Follow-up URL:', url);
	  const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data),
	  });
	  const text = await res.text();
	  console.log('Follow-up response status:', res.status);
	  //console.log('Follow-up response body:', text);
    console.log('🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈');
	  if (!res.ok) {
		console.error('Follow-up failed with status', res.status, ':', text);
		throw new Error(`Follow-up failed: ${res.status} ${text}`);
	  }
	  return res;
	} catch (err) {
	  console.error('Failed to send follow-up:', err);
	  throw err;
	}
  }

// Helper function to get events + counter from KV
async function getEventsState(env) {
	//console.log('[KV] 📖 Reading events from MARVELING_EVENTS');
	//console.log('[KV] 🔍 env object keys:', Object.keys(env || {}));
	//console.log('[KV] 🔍 MARVELING_EVENTS binding:', env?.MARVELING_EVENTS ? 'EXISTS ✅' : 'MISSING ❌');
	
	if (!env || !env.MARVELING_EVENTS) {
	  console.error('[KV] ❌ MARVELING_EVENTS binding not found in env!');
	  console.error('[KV] Available bindings:', Object.keys(env || {}));
	  return { events: {}, counter: 1000 };
	}
	
	try {
	  //console.log('[KV] Calling env.MARVELING_EVENTS.get("events", "json")...');
	  const data = await env.MARVELING_EVENTS.get('events', 'json');
	  //console.log('[KV] Raw data from KV:', data);
	  console.log('[KV] ✅ Retrieved data:', data ? `${Object.keys(data.events || {}).length} events, counter: ${data.counter}` : 'null/empty');
	  
	  if (!data) {
		console.log('[KV] ⚠️ No data found, returning defaults');
		return { events: {}, counter: 1000 };
	  }
	  
	  return {
		events: data?.events || {},
		counter: data?.counter || 1000,
	  };
	} catch (err) {
	  console.error('[KV] ❌ Error loading events from KV:', err);
	  console.error('[KV] Error details:', err.message, err.stack);
	  return { events: {}, counter: 1000 };
	}
  }

// Backwards-compat helper (only events)
async function getAllEvents(env) {
	const { events } = await getEventsState(env);
	return events;
  }

// Helper function to check if event is still active
function isEventActive(event, now) {
	if (!event) return false;
	
	if ((event.type === 'planned' && event.time) || event.type === 'now') {
	  let eventTime;
	  
	  if (event.type === 'planned') {
		if (event.eventTimeIso) {
		  eventTime = new Date(event.eventTimeIso);
		} else if (event.reminderTime) {
		  const reminderTime = new Date(event.reminderTime);
		  eventTime = new Date(reminderTime.getTime() + 45 * 60 * 1000); // 45 mins after reminder
		} else if (event.time) {
		  // For now, if we can't parse, consider it active
		  return true;
		}
	  } else if (event.type === 'now') {
		eventTime = new Date(event.time || event.createdAt);
	  }
	  
	  if (eventTime) {
		const eventEndTime = new Date(eventTime.getTime() + 30 * 60 * 1000); // 30 mins after event start
		return eventEndTime > now;
	  }
	}
	
	return true; // Keep event if we can't determine time
  }

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },

  // Scheduled handler for cron jobs
  async scheduled(event, env, ctx) {
    // This is where you'd put your /check-reminders logic
    console.log('Cron triggered:', new Date(event.scheduledTime).toISOString());
    
    // TODO: Implement reminder checking logic
    // You can call your Supabase functions here
  },
};

  async function handleRequest(request, env, ctx) {
  //console.log(`[${new Date().toISOString()}] Incoming request: ${request.method} ${request.url}`);
  const url = new URL(request.url);

  // Health check endpoint
  if (url.pathname === '/' || url.pathname === '/health') {
    return new Response('🤖 Marveling Bot Worker is running!', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  
  // Debug endpoint to check environment
  if (url.pathname === '/debug-env') {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      env_keys: Object.keys(env || {}),
      bindings: {
        MARVELING_EVENTS: env?.MARVELING_EVENTS ? 'BOUND ✅' : 'MISSING ❌',
      },
      vars: {
        SUPABASE_URL: env?.SUPABASE_URL ? 'SET ✅' : 'MISSING ❌',
        SUPABASE_KEY: env?.SUPABASE_KEY ? 'SET ✅' : 'MISSING ❌',
        RIVALING_ROLE_ID: env?.RIVALING_ROLE_ID || 'MISSING ❌',
        PORT: env?.PORT || 'MISSING ❌',
      }
    };
    
    return new Response(JSON.stringify(debugInfo, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Only allow /interactions route
  if (url.pathname !== '/interactions') {
    return new Response('Not Found', { status: 404 });
  }

  // Only POST requests
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const body = await request.text();
  // console.log('Request headers:', Object.fromEntries(request.headers.entries()));
  // console.log('Request body:', body);
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');

  // Verify Discord request signature
  const isValidRequest = verifyDiscordSignature(signature, timestamp, body, PUBLIC_KEY);
  //console.log('Signature verification result:', isValidRequest);

  if (!isValidRequest) {
    return new Response('Invalid request signature', { status: 401 });
  }

  let interaction;
  try {
    interaction = JSON.parse(body);
	// console.log('Parsed interaction:', interaction);
  } catch (err) {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Handle Discord PING
  if (interaction.type === InteractionType.PING) {
    return jsonResponse({ type: InteractionResponseType.PONG });
  }

  // Handle application commands (slash commands)
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    return handleCommand(interaction, env, ctx);
  }

  // Handle message components (buttons)
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    return handleButton(interaction, env);
  }

  // Default fallback
  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: 'Unknown interaction type',
      flags: MessageFlags.EPHEMERAL,
    },
  });
}

async function handleCommand(interaction, env, ctx) {
  const commandName = interaction.data.name;
  console.log(`Handling command: ${commandName} from user: ${interaction.member?.user?.id}`);
  // Simple command routing
  switch (commandName) {
    case 'help':
    case 'playnow':
	case 'plan':
	case 'list':
	case 'guests':
	case 'invite':
	case 'reschedule':
	case 'delete':
	case 'achievements':
	// Send deferred response first
	const deferResponse = jsonResponse({
		type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
		data: { flags: 0 } // 👈 make deferred responses ephemeral
	  });
	  
	// Process command asynchronously and ensure it completes
	const applicationId = interaction.application_id || CLIENT_ID;
	if (ctx) {
	  ctx.waitUntil(
		processCommand(interaction, env).catch(err => {
		  console.error('Command error:', err);
		  // Try to send error message as follow-up
		  return sendFollowUp(applicationId, interaction.token, {
			content: `❌ An error occurred while processing your command: ${err.message}`,
			flags: MessageFlags.EPHEMERAL
		  }).catch(e => console.error('Failed to send error follow-up:', e));
		})
	  );
	} else {
	  // Fallback if ctx is not available
	  processCommand(interaction, env).catch(err => console.error('Command error:', err));
	}

	return deferResponse;

    default:
      return jsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `❌ Unknown command: ${commandName}`,
          flags: MessageFlags.EPHEMERAL,
        },
      });
  }
}

// Import command handlers (Note: In a real setup, you'd need to bundle these or use a different approach)
// For now, we'll use the handler functions directly
// In production, you might want to create ES module versions or use a bundler

import { handleAchievementsCommand } from './commands/achievements.js';
import { handleHelpCommand } from './commands/help.js';
import { handleListCommand } from './commands/list.js';
import { handleGuestsCommand } from './commands/guests.js';
import { handleDeleteCommand } from './commands/delete.js';
import { handleInviteCommand } from './commands/invite.js';
import { handlePlanCommand } from './commands/plan.js';
import { handlePlaynowCommand } from './commands/playnow.js';
import { handleRescheduleCommand } from './commands/reschedule.js';

async function processCommand(interaction, env) {
	const name = interaction.data.name;
	const userId = interaction.member?.user?.id;
	const username = interaction.member?.user?.username || interaction.user?.username;
	const token = interaction.token;
	const applicationId = interaction.application_id || CLIENT_ID;
	const channelId = interaction.channel_id;
	const roleId = env?.RIVALING_ROLE_ID;
  
	// console.log(`[COMMAND] ========================================`);
	// console.log(`[COMMAND] Processing: ${name} for user: ${userId} (${username})`);
	// console.log(`[COMMAND] 🔍 Environment check:`);
	// console.log(`[COMMAND] - env object:`, env ? 'EXISTS ✅' : 'MISSING ❌');
	// console.log(`[COMMAND] - env keys:`, Object.keys(env || {}));
	// console.log(`[COMMAND] - SUPABASE_URL:`, env?.SUPABASE_URL ? 'SET ✅' : 'MISSING ❌');
	// console.log(`[COMMAND] - SUPABASE_KEY:`, env?.SUPABASE_KEY ? 'SET ✅' : 'MISSING ❌');
	// console.log(`[COMMAND] - MARVELING_EVENTS:`, env?.MARVELING_EVENTS ? 'BOUND ✅' : 'MISSING ❌');
	// console.log(`[COMMAND] - RIVALING_ROLE_ID:`, env?.RIVALING_ROLE_ID || 'MISSING ❌');
	// console.log(`[COMMAND] ========================================`);
	
	// Initialize Supabase client
	const supabase = createSupabaseClient(env);
	if (supabase) {
		// console.log('[COMMAND] ✅ Supabase client initialized');
	} else {
		console.log('[COMMAND] ⚠️ Supabase client not available - achievements disabled');
	}
	
	try {
	  // Get events from KV
	  const events = await getAllEvents(env);
	  //console.log(`[COMMAND] Loaded ${Object.keys(events).length} events from KV`);
	  
	  // Get next event ID
	  const eventIds = Object.keys(events);
	  const nextEventId = eventIds.length > 0 
		? Math.max(...eventIds.map(id => parseInt(id) || 0)) + 1
		: 1000;
	  
	  let result;
	  
	  // Route to appropriate command handler
	  switch (name) {
		case 'list': {
		  result = await handleListCommand(events, userId);
		  break;
		}
		case 'help': {
		  result = handleHelpCommand();
		  break;
		}
		case 'guests': {
		  result = handleGuestsCommand(interaction, events);
		  break;
		}
		case 'invite': {
			result = await handleInviteCommand(
			  interaction,
			  events,
			  userId,
			  username,
			  env,
			  supabase,
			  saveEvent,
			  trackInviteSent
			);
			break;
		}
		case 'delete': {
			result = await handleDeleteCommand(interaction, events, userId, env, supabase, sendFollowUp, applicationId, token, deleteEventFromKV);
			break;
		}
		case 'playnow': {
			// Call the command handler and await everything inside
			result = await handlePlaynowCommand({
			  userId,
			  username,
			  roleId,
			  nextEventId,
			  env,
			  supabase,
			  saveEvent
			});
			// Assign the main Discord response directly
			result = result.response;
			break;
		}
		case 'plan': {
			result = await handlePlanCommand(
			  interaction,
			  userId,
			  nextEventId,
			  roleId,
			  channelId,
			  env,
			  supabase,
			  saveEvent,
			  sendFollowUp,
			  applicationId,
			  token
			);
			break;
		}
		case 'reschedule': {
			result = await handleRescheduleCommand(interaction, events, supabase, env);
			break;
		}
		case 'achievements': {
			result = await handleAchievementsCommand(interaction, supabase);
			break;
		}
		default:
		  result = { content: `❌ Unknown command: ${name}`, flags: 64 };
	  }
	  
	  // Send the response
	  if (result) {
		await sendFollowUp(applicationId, token, result);
	  }
	} catch (err) {
	  console.error(`Error processing command ${name}:`, err);
	  try {
		await sendFollowUp(applicationId, token, { 
		  content: `❌ Error processing command: ${err.message}`, 
		  flags: MessageFlags.EPHEMERAL 
		});
	  } catch (followUpErr) {
		console.error('Failed to send error follow-up:', followUpErr);
	  }
	}
  }





  
// Helper functions for KV operations
async function saveEvent(env, eventId, event) {
	console.log(`[KV] 💾 Saving event #${eventId}`, event);
	try {
	  const { events, counter } = await getEventsState(env);
	  events[eventId] = event;
	  
	  // Bump counter if needed
	  const nextCounter = Math.max(counter, (parseInt(eventId, 10) || 0) + 1);
	  
	  const saveData = { events, counter: nextCounter };
	  console.log(`[KV] 📝 Writing to MARVELING_EVENTS: ${Object.keys(events).length} events, counter: ${nextCounter}`);
	  
	  await env.MARVELING_EVENTS.put('events', JSON.stringify(saveData));
	  console.log(`[KV] ✅ Event #${eventId} saved successfully`);
	} catch (err) {
	  console.error('[KV] ❌ Error saving event to KV:', err);
	  throw err;
	}
  }

async function deleteEventFromKV(env, eventId) {
	//console.log(`[KV] 🗑️  Deleting event #${eventId}`);
	try {
	  const { events, counter } = await getEventsState(env);
	  delete events[eventId];
	  
	  console.log(`[KV] 📝 Writing to MARVELING_EVENTS: ${Object.keys(events).length} events remaining`);
	  await env.MARVELING_EVENTS.put('events', JSON.stringify({ events, counter }));
	  console.log(`[KV] ✅ Event #${eventId} deleted successfully`);
	} catch (err) {
	  console.error('[KV] ❌ Error deleting event from KV:', err);
	  throw err;
	}
  }

async function handleButton(interaction, env) {
  const buttonId = interaction.data.custom_id;
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const channelId = interaction.channel_id;
  
  console.log(`[BUTTON] User ${userId} clicked button: ${buttonId} in channel ${channelId}`);

  // Handle RSVP buttons
  if (buttonId.startsWith('rsvp_')) {
    const parts = buttonId.split('_');
    const action = parts[1]; // yes, maybe, no, reschedule
    const eventId = parts[2];
    
    console.log(`[BUTTON] RSVP action: ${action}, eventId: ${eventId}`);

    // Initialize Supabase client
    const supabase = createSupabaseClient(env);

    // Load events from KV
    const { events, counter } = await getEventsState(env);
    const event = events[eventId];

    if (!event) {
      console.log(`[BUTTON] ❌ Event #${eventId} not found`);
      return jsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `❌ Event #${eventId} not found.`,
          flags: MessageFlags.EPHEMERAL,
        },
      });
    }

    // Ensure arrays exist
    event.attendees = event.attendees || [];
    event.invited = event.invited || [];
    event.maybe = event.maybe || [];

    let message = '';
    let shouldTrackAchievements = false;
    
    switch (action) {
      case 'yes':
        if (!event.attendees.includes(userId)) {
          console.log(`[BUTTON] Adding ${userId} to attendees for event #${eventId}`);
          event.attendees.push(userId);
          shouldTrackAchievements = true;
        } else {
          console.log(`[BUTTON] User ${userId} already in attendees`);
        }
        // Remove from maybe/ invited lists
        event.maybe = event.maybe.filter(u => u !== userId);
        event.invited = event.invited.filter(u => u !== userId);
        message = `✅ You're in for event #${eventId}!`;
        
		// Track achievements for RSVP
        if (shouldTrackAchievements) {
          console.log(`[BUTTON] Tracking RSVP achievements for ${userId}`);
          const rsvpAchievements = await trackRSVP(supabase, userId, eventId);
          const fastRSVPAchievements = await trackFastRSVP(supabase, userId, event.createdAt || Date.now());
          
          let worthyAchievements = [];
          // Check for Worthy Event (5+ attendees)
          if (event.attendees.length >= 5) {
            console.log(`[BUTTON] Event #${eventId} has 5+ attendees, tracking Worthy achievement`);
            worthyAchievements = await trackWorthyEvent(supabase, event.creatorId, event.attendees.length);
          }
          
          // Check for Avengers Assemble (all invited RSVP'd)
          const avengersAchievements = await checkAvengersAssemble(supabase, event);
          
          // Combine all achievements
          const allAchievements = [...rsvpAchievements, ...fastRSVPAchievements];
          
          // Send personal achievements
          if (allAchievements.length > 0) {
            const achievementText = allAchievements.map(a => `<@${userId}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
            console.log(`[BUTTON] Sending achievement announcement:`, achievementText);
            // Send via Discord REST API
            await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bot ${env.DISCORD_TOKEN}`
              },
              body: JSON.stringify({ content: achievementText })
            }).catch(() => {});
          }
          
          // Send host's Worthy achievement
          if (worthyAchievements.length > 0 && event.creatorId !== userId) {
            const worthyText = worthyAchievements.map(a => `<@${event.creatorId}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
            await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bot ${env.DISCORD_TOKEN}`
              },
              body: JSON.stringify({ content: worthyText })
            }).catch(() => {});
          }
          
          // Send Avengers Assemble achievements
          if (avengersAchievements.length > 0) {
            for (const { userId: avengerUserId, achievements } of avengersAchievements) {
              const avengersText = achievements.map(a => `<@${avengerUserId}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
              await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bot ${env.DISCORD_TOKEN}`
                },
                body: JSON.stringify({ content: avengersText })
              }).catch(() => {});
            }
          }
        }
        break;
        
      case 'maybe':
        if (!event.maybe.includes(userId)) {
          console.log(`[BUTTON] Adding ${userId} to maybe for event #${eventId}`);
          event.maybe.push(userId);
          shouldTrackAchievements = true;
        }
        event.attendees = event.attendees.filter(u => u !== userId);
        message = `🤔 Marked as maybe for event #${eventId}`;
        
        // Track maybe achievement
        if (shouldTrackAchievements) {
          console.log(`[BUTTON] Tracking maybe achievement for ${userId}`);
          const maybeAchievements = await trackMaybe(supabase, userId);
          
          // Send achievement announcement
          if (maybeAchievements.length > 0) {
            const achievementText = maybeAchievements.map(a => `<@${userId}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
            await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bot ${env.DISCORD_TOKEN}`
              },
              body: JSON.stringify({ content: achievementText })
            }).catch(() => {});
          }
        }
        break;
        
      case 'no':
        console.log(`[BUTTON] Removing ${userId} from event #${eventId}`);
        event.attendees = event.attendees.filter(u => u !== userId);
        event.maybe = event.maybe.filter(u => u !== userId);
        message = `👎 You won't be attending event #${eventId}`;
        break;
        
      case 'reschedule':
        message = `🔁 To reschedule, use the \`/reschedule\` command with the event ID and new time.`;
        break;
        
      default:
        message = 'Unknown action';
    }

    // Persist updates
    console.log(`[BUTTON] Persisting event #${eventId} updates to KV`);
    events[eventId] = event;
    await env.MARVELING_EVENTS.put('events', JSON.stringify({ events, counter }));
    console.log(`[BUTTON] ✅ Event #${eventId} updated successfully`);

    return jsonResponse({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: message,
        flags: MessageFlags.EPHEMERAL,
      },
    });
  }

  // Default button response
  return jsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: '👍 Button pressed',
      flags: MessageFlags.EPHEMERAL,
    },
  });
}

// Helper functions

function verifyDiscordSignature(signature, timestamp, body, publicKey) {
  if (!signature || !timestamp) return false;

  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(timestamp + body),
      hexToUint8Array(signature),
      hexToUint8Array(publicKey)
    );
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

function hexToUint8Array(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}
