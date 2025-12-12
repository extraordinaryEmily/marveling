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
} from './achievements.js';

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
	console.log(`Sending follow-up to token: ${interactionToken}`);
	console.log('Message data:', JSON.stringify(data, null, 2));
	try {
	  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`;
	  console.log('Follow-up URL:', url);
	  const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data),
	  });
	  const text = await res.text();
	  console.log('Follow-up response status:', res.status);
	  console.log('Follow-up response body:', text);
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
	console.log('[KV] 📖 Reading events from MARVELING_EVENTS');
	console.log('[KV] 🔍 env object keys:', Object.keys(env || {}));
	console.log('[KV] 🔍 MARVELING_EVENTS binding:', env?.MARVELING_EVENTS ? 'EXISTS ✅' : 'MISSING ❌');
	
	if (!env || !env.MARVELING_EVENTS) {
	  console.error('[KV] ❌ MARVELING_EVENTS binding not found in env!');
	  console.error('[KV] Available bindings:', Object.keys(env || {}));
	  return { events: {}, counter: 1000 };
	}
	
	try {
	  console.log('[KV] Calling env.MARVELING_EVENTS.get("events", "json")...');
	  const data = await env.MARVELING_EVENTS.get('events', 'json');
	  console.log('[KV] Raw data from KV:', data);
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
  console.log(`[${new Date().toISOString()}] Incoming request: ${request.method} ${request.url}`);
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
  console.log('Request headers:', Object.fromEntries(request.headers.entries()));
  console.log('Request body:', body);
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');

  // Verify Discord request signature
  const isValidRequest = verifyDiscordSignature(signature, timestamp, body, PUBLIC_KEY);
  console.log('Signature verification result:', isValidRequest);

  if (!isValidRequest) {
    return new Response('Invalid request signature', { status: 401 });
  }

  let interaction;
  try {
    interaction = JSON.parse(body);
	console.log('Parsed interaction:', interaction);
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

import {
  handleListCommand,
  handleHelpCommand,
  handleGuestsCommand,
  handleInviteCommand,
  handleDeleteCommand,
  handlePlaynowCommand,
  handlePlanCommand,
  handleRescheduleCommand,
  handleAchievementsCommand
} from './commands.js';

async function processCommand(interaction, env) {
	const name = interaction.data.name;
	const userId = interaction.member?.user?.id;
	const username = interaction.member?.user?.username || interaction.user?.username;
	const token = interaction.token;
	const applicationId = interaction.application_id || CLIENT_ID;
	const channelId = interaction.channel_id;
	const roleId = env?.RIVALING_ROLE_ID;
  
	console.log(`[COMMAND] ========================================`);
	console.log(`[COMMAND] Processing: ${name} for user: ${userId} (${username})`);
	console.log(`[COMMAND] 🔍 Environment check:`);
	console.log(`[COMMAND] - env object:`, env ? 'EXISTS ✅' : 'MISSING ❌');
	console.log(`[COMMAND] - env keys:`, Object.keys(env || {}));
	console.log(`[COMMAND] - SUPABASE_URL:`, env?.SUPABASE_URL ? 'SET ✅' : 'MISSING ❌');
	console.log(`[COMMAND] - SUPABASE_KEY:`, env?.SUPABASE_KEY ? 'SET ✅' : 'MISSING ❌');
	console.log(`[COMMAND] - MARVELING_EVENTS:`, env?.MARVELING_EVENTS ? 'BOUND ✅' : 'MISSING ❌');
	console.log(`[COMMAND] - RIVALING_ROLE_ID:`, env?.RIVALING_ROLE_ID || 'MISSING ❌');
	console.log(`[COMMAND] ========================================`);
	
	// Initialize Supabase client
	const supabase = createSupabaseClient(env);
	if (supabase) {
		console.log('[COMMAND] ✅ Supabase client initialized');
	} else {
		console.log('[COMMAND] ⚠️ Supabase client not available - achievements disabled');
	}
	
	try {
	  // Get events from KV
	  const events = await getAllEvents(env);
	  console.log(`[COMMAND] Loaded ${Object.keys(events).length} events from KV`);
	  
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
		  const eventId = interaction.data.options?.find(opt => opt.name === 'id')?.value?.replace('#', '');
		  if (!eventId) {
			result = { content: '❌ Event ID is required.', flags: 64 };
		  } else {
			result = handleGuestsCommand(events, eventId);
		  }
		  break;
		}
		case 'invite': {
		  const eventId = interaction.data.options?.find(opt => opt.name === 'id')?.value?.replace('#', '');
		  const personOption = interaction.data.options?.find(opt => opt.name === 'person');
		  const guestOption = interaction.data.options?.find(opt => opt.name === 'guest');
		  const personId = personOption?.value || (interaction.data.resolved?.users?.[personOption?.value]?.id);
		  const guestString = guestOption?.value;
		  
		  console.log(`[COMMAND] Invite: eventId=${eventId}, personId=${personId}, guestString=${guestString}`);
		  result = await handleInviteCommand(events, eventId, userId, username, personId, guestString);
		  
		  // Save updated event if needed
		  if (result.needsSave && result.updatedEvent) {
			console.log(`[COMMAND] Saving updated event after invite`);
			await saveEvent(env, eventId, result.updatedEvent);
			
			// Track achievement for invite
			if (personId) {
			  console.log(`[COMMAND] Tracking invite achievement for ${userId}`);
			  await trackInviteSent(supabase, userId);
			}
		  }
		  
		  // Use response from result
		  result = result.response || result;
		  break;
		}
		case 'delete': {
		  const eventId = interaction.data.options?.find(opt => opt.name === 'id')?.value?.replace('#', '');
		  console.log(`[COMMAND] Delete: eventId=${eventId}`);
		  result = await handleDeleteCommand(events, eventId, userId);
		  
		  // Delete event if needed
		  if (result.needsDelete) {
			console.log(`[COMMAND] Deleting event #${result.eventId} from KV`);
			await deleteEventFromKV(env, result.eventId);
			
			// Cancel reminder in Supabase
			if (supabase) {
			  console.log(`[COMMAND] Canceling reminder for event #${result.eventId}`);
			  try {
				await supabase.cancelReminder(result.eventId);
			  } catch (error) {
				console.error('[COMMAND] Failed to cancel reminder:', error);
			  }
			}
		  }
		  
		  // Send follow-ups
		  if (result.followUps && result.followUps.length > 0) {
			for (const followUp of result.followUps) {
			  await sendFollowUp(applicationId, token, followUp);
			}
		  }
		  
		  // Use response from result
		  result = result.response || result;
		  break;
		}
		case 'playnow': {
		  console.log(`[COMMAND] Playnow: userId=${userId}, nextEventId=${nextEventId}`);
		  const cmdResult = handlePlaynowCommand(userId, username, roleId, nextEventId);
		  
		  // Save new event
		  if (cmdResult.newEvent) {
			console.log(`[COMMAND] Saving new playnow event #${cmdResult.newEvent.id}`);
			await saveEvent(env, cmdResult.newEvent.id.toString(), cmdResult.newEvent);
			
			// Track achievements
			console.log(`[COMMAND] Tracking host achievements for ${userId}`);
			const hostAchievements = await trackHostCreated(supabase, userId);
			
			// Check Moon Knight (midnight-4am PST)
			const pstHour = parseInt(new Date().toLocaleString('en-US', { 
			  timeZone: 'America/Los_Angeles', 
			  hour: 'numeric', 
			  hour12: false 
			}));
			console.log(`[COMMAND] Current PST hour: ${pstHour}`);
			const moonKnightAchievements = await checkMoonKnight(supabase, userId, pstHour);
			
			// Track host timestamp
			const timestampAchievements = await trackHostWithTimestamp(supabase, userId);
			
			// Combine all achievements
			const allAchievements = [...hostAchievements, ...moonKnightAchievements, ...timestampAchievements];
			
			// Send achievement announcements
			if (allAchievements.length > 0) {
			  const achievementText = allAchievements.map(a => `<@${userId}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
			  console.log(`[COMMAND] Sending achievement announcement:`, achievementText);
			  await sendFollowUp(applicationId, token, { content: achievementText });
			}
		  }
		  
		  // Send follow-ups
		  if (cmdResult.followUps && cmdResult.followUps.length > 0) {
			for (const followUp of cmdResult.followUps) {
			  await sendFollowUp(applicationId, token, followUp);
			}
		  }
		  
		  result = cmdResult.response;
		  break;
		}
		case 'plan': {
		  const time = interaction.data.options?.find(opt => opt.name === 'time')?.value;
		  if (!time) {
			result = { content: '❌ Time is required.', flags: 64 };
		  } else {
			console.log(`[COMMAND] Plan: userId=${userId}, time=${time}, nextEventId=${nextEventId}`);
			
			// TODO: Parse time string to get eventTimeIso and reminderTimeIso
			// For now, pass null and compute later
			const cmdResult = handlePlanCommand(userId, time, nextEventId, roleId, channelId, null, null);
			
			// Save new event
		  if (cmdResult.newEvent) {
			console.log(`[COMMAND] Saving new plan event #${cmdResult.newEvent.id}`);
			await saveEvent(env, cmdResult.newEvent.id.toString(), cmdResult.newEvent);
			
			// Track achievements
			console.log(`[COMMAND] Tracking host achievements for ${userId}`);
			const hostAchievements = await trackHostCreated(supabase, userId);
			
			// Check Moon Knight
			const pstHour = parseInt(new Date().toLocaleString('en-US', { 
			  timeZone: 'America/Los_Angeles', 
			  hour: 'numeric', 
			  hour12: false 
			}));
			const moonKnightAchievements = await checkMoonKnight(supabase, userId, pstHour);
			
			// Check Wakanda Strategist (3+ days in advance)
			let strategistAchievements = [];
			if (cmdResult.newEvent.eventTimeIso) {
			  const eventTime = new Date(cmdResult.newEvent.eventTimeIso);
			  const daysInAdvance = (eventTime - Date.now()) / (1000 * 60 * 60 * 24);
			  console.log(`[COMMAND] Event planned ${daysInAdvance.toFixed(2)} days in advance`);
			  strategistAchievements = await checkWakandaStrategist(supabase, userId, daysInAdvance);
			}
			
			// Track host timestamp
			const timestampAchievements = await trackHostWithTimestamp(supabase, userId);
			
			// Combine all achievements
			const allAchievements = [...hostAchievements, ...moonKnightAchievements, ...strategistAchievements, ...timestampAchievements];
			
			// Send achievement announcements
			if (allAchievements.length > 0) {
			  const achievementText = allAchievements.map(a => `<@${userId}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
			  console.log(`[COMMAND] Sending achievement announcement:`, achievementText);
			  await sendFollowUp(applicationId, token, { content: achievementText });
			}
			
			// Schedule reminder if available
			if (cmdResult.reminderData && supabase) {
			  console.log(`[COMMAND] Scheduling reminder for event #${nextEventId}`);
			  try {
				await supabase.scheduleReminder(
				  cmdResult.reminderData.eventId,
				  cmdResult.reminderData.reminderTime,
				  cmdResult.reminderData.channelId,
				  cmdResult.reminderData.attendees
				);
			  } catch (error) {
				console.error('[COMMAND] Failed to schedule reminder:', error);
			  }
			}
		  }
			
			// Send follow-ups
			if (cmdResult.followUps && cmdResult.followUps.length > 0) {
			  for (const followUp of cmdResult.followUps) {
				await sendFollowUp(applicationId, token, followUp);
			  }
			}
			
			result = cmdResult.response;
		  }
		  break;
		}
		case 'reschedule': {
		  const eventId = interaction.data.options?.find(opt => opt.name === 'id')?.value?.replace('#', '');
		  const newTime = interaction.data.options?.find(opt => opt.name === 'time')?.value;
		  
		  console.log(`[COMMAND] Reschedule: eventId=${eventId}, newTime=${newTime}, nextEventId=${nextEventId}`);
		  const cmdResult = handleRescheduleCommand(events, eventId, userId, newTime, nextEventId, roleId, channelId, null, null);
		  
		  // Delete old event and save new one
		  if (cmdResult.needsDelete) {
			console.log(`[COMMAND] Deleting old event #${cmdResult.oldEventId}`);
			await deleteEventFromKV(env, cmdResult.oldEventId);
			
			// Cancel old reminder
			if (supabase) {
			  console.log(`[COMMAND] Canceling old reminder for event #${cmdResult.oldEventId}`);
			  try {
				await supabase.cancelReminder(cmdResult.oldEventId);
			  } catch (error) {
				console.error('[COMMAND] Failed to cancel old reminder:', error);
			  }
			}
		  }
		  
		  if (cmdResult.newEvent) {
			console.log(`[COMMAND] Saving new rescheduled event #${cmdResult.newEvent.id}`);
			await saveEvent(env, cmdResult.newEvent.id.toString(), cmdResult.newEvent);
			
			// Schedule new reminder if available
			if (cmdResult.reminderData && supabase) {
			  console.log(`[COMMAND] Scheduling new reminder for event #${nextEventId}`);
			  try {
				await supabase.scheduleReminder(
				  cmdResult.reminderData.eventId,
				  cmdResult.reminderData.reminderTime,
				  cmdResult.reminderData.channelId,
				  cmdResult.reminderData.attendees
				);
			  } catch (error) {
				console.error('[COMMAND] Failed to schedule new reminder:', error);
			  }
			}
		  }
		  
		  // Send follow-ups
		  if (cmdResult.followUps && cmdResult.followUps.length > 0) {
			for (const followUp of cmdResult.followUps) {
			  await sendFollowUp(applicationId, token, followUp);
			}
		  }
		  
		  result = cmdResult.response;
		  break;
		}
		case 'achievements': {
		  const userOption = interaction.data.options?.find(opt => opt.name === 'user');
		  const targetUserId = userOption?.value || userId;
		  const targetUser = interaction.data.resolved?.users?.[targetUserId] || interaction.member?.user || interaction.user;
		  
		  console.log(`[COMMAND] Fetching achievements for user ${targetUserId}`);
		  
		  // Fetch actual stats from Supabase
		  let stats = { hostsCreated: 0, invitesSent: 0, rsvpsMade: 0 };
		  let ranks = { host: {}, recruiter: {}, responder: {} };
		  let legendaryAchievements = [];
		  
		  if (supabase) {
			try {
			  const userStats = await supabase.getUserStats(targetUserId);
			  console.log(`[COMMAND] Fetched stats from Supabase:`, userStats);
			  
			  stats = {
				hostsCreated: userStats.hosts_created || 0,
				invitesSent: userStats.invites_sent || 0,
				rsvpsMade: userStats.rsvps_made || 0
			  };
			  
			  // Calculate ranks from the ACHIEVEMENT_TIERS
			  const { ACHIEVEMENT_TIERS } = await import('./achievements.js');
			  
			  const getHighestRank = (tiers, count) => {
				let currentRank = null;
				let nextRank = tiers[0];
				
				for (let i = 0; i < tiers.length; i++) {
				  if (count >= tiers[i].count) {
					currentRank = tiers[i];
					nextRank = tiers[i + 1] || null;
				  } else {
					break;
				  }
				}
				
				return { current: currentRank, next: nextRank, progress: count };
			  };
			  
			  ranks = {
				host: getHighestRank(ACHIEVEMENT_TIERS.HOST, stats.hostsCreated),
				recruiter: getHighestRank(ACHIEVEMENT_TIERS.RECRUITER, stats.invitesSent),
				responder: getHighestRank(ACHIEVEMENT_TIERS.RESPONDER, stats.rsvpsMade)
			  };
			  
			  console.log(`[COMMAND] Calculated ranks:`, ranks);
			  
			  // TODO: Fetch legendary achievements
			} catch (error) {
			  console.error('[COMMAND] Error fetching achievements from Supabase:', error);
			}
		  }
		  
		  const cmdResult = handleAchievementsCommand(
			targetUserId,
			targetUser.username || targetUser.global_name,
			targetUser.avatar,
			stats,
			ranks,
			legendaryAchievements
		  );
		  
		  result = cmdResult.response;
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
	console.log(`[KV] 🗑️  Deleting event #${eventId}`);
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
        message = `⛔ You won't be attending event #${eventId}`;
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
      content: '✅ Button pressed',
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
