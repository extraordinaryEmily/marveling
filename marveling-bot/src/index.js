import nacl from 'tweetnacl';

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
	try {
	  const data = await env.MARVELING_EVENTS.get('events', 'json');
	  return {
		events: data?.events || {},
		counter: data?.counter || 1000,
	  };
	} catch (err) {
	  console.error('Error loading events from KV:', err);
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
	const deferResponse = jsonResponse({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

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
	const roleId = env.RIVALING_ROLE_ID;
  
	console.log(`Processing command: ${name} for user: ${userId}`);
	
	try {
	  // Get events from KV
	  const events = await getAllEvents(env);
	  
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
		  
		  result = await handleInviteCommand(events, eventId, userId, username, personId, guestString);
		  
		  // Save updated event if needed
		  if (result.needsSave && result.updatedEvent) {
			await saveEvent(env, eventId, result.updatedEvent);
		  }
		  
		  // Use response from result
		  result = result.response || result;
		  break;
		}
		case 'delete': {
		  const eventId = interaction.data.options?.find(opt => opt.name === 'id')?.value?.replace('#', '');
		  result = await handleDeleteCommand(events, eventId, userId);
		  
		  // Delete event if needed
		  if (result.needsDelete) {
			await deleteEventFromKV(env, result.eventId);
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
		  const cmdResult = handlePlaynowCommand(userId, username, roleId, nextEventId);
		  
		  // Save new event
		  if (cmdResult.newEvent) {
			await saveEvent(env, cmdResult.newEvent.id.toString(), cmdResult.newEvent);
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
			const cmdResult = handlePlanCommand(userId, time, nextEventId, roleId, channelId, null, null);
			
			// Save new event
			if (cmdResult.newEvent) {
			  await saveEvent(env, cmdResult.newEvent.id.toString(), cmdResult.newEvent);
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
		  
		  const cmdResult = handleRescheduleCommand(events, eventId, userId, newTime, nextEventId, roleId, channelId, null, null);
		  
		  // Delete old event and save new one
		  if (cmdResult.needsDelete) {
			await deleteEventFromKV(env, cmdResult.oldEventId);
		  }
		  if (cmdResult.newEvent) {
			await saveEvent(env, cmdResult.newEvent.id.toString(), cmdResult.newEvent);
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
		  
		  // Simplified - would need to fetch stats from Supabase
		  const stats = { hostsCreated: 0, invitesSent: 0, rsvpsMade: 0 };
		  const ranks = { host: {}, recruiter: {}, responder: {} };
		  const legendaryAchievements = [];
		  
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
	try {
	  const { events, counter } = await getEventsState(env);
	  events[eventId] = event;
	  
	  // Bump counter if needed
	  const nextCounter = Math.max(counter, (parseInt(eventId, 10) || 0) + 1);
	  
	  await env.MARVELING_EVENTS.put('events', JSON.stringify({ events, counter: nextCounter }));
	} catch (err) {
	  console.error('Error saving event to KV:', err);
	}
  }

async function deleteEventFromKV(env, eventId) {
	try {
	  const { events, counter } = await getEventsState(env);
	  delete events[eventId];
	  
	  await env.MARVELING_EVENTS.put('events', JSON.stringify({ events, counter }));
	} catch (err) {
	  console.error('Error deleting event from KV:', err);
	}
  }

async function handleButton(interaction, env) {
  const buttonId = interaction.data.custom_id;
  const userId = interaction.member?.user?.id || interaction.user?.id;

  // Handle RSVP buttons
  if (buttonId.startsWith('rsvp_')) {
    const parts = buttonId.split('_');
    const action = parts[1]; // yes, maybe, no, reschedule
    const eventId = parts[2];

    // Load events from KV
    const { events, counter } = await getEventsState(env);
    const event = events[eventId];

    if (!event) {
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
    switch (action) {
      case 'yes':
        if (!event.attendees.includes(userId)) {
          event.attendees.push(userId);
        }
        // Remove from maybe/ invited lists
        event.maybe = event.maybe.filter(u => u !== userId);
        event.invited = event.invited.filter(u => u !== userId);
        message = `✅ You're in for event #${eventId}!`;
        break;
      case 'maybe':
        if (!event.maybe.includes(userId)) {
          event.maybe.push(userId);
        }
        event.attendees = event.attendees.filter(u => u !== userId);
        message = `🤔 Marked as maybe for event #${eventId}`;
        break;
      case 'no':
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
    events[eventId] = event;
    await env.MARVELING_EVENTS.put('events', JSON.stringify({ events, counter }));

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
