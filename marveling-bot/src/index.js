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

async function sendFollowUp(interactionToken, content) {
	console.log(`Sending follow-up to token: ${interactionToken}`);
	console.log('Message content:', content);
	try {
	  const res = await fetch(`https://discord.com/api/v10/webhooks/${CLIENT_ID}/${interactionToken}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ content }),
	  });
	  const text = await res.text();
	  console.log('Follow-up response status:', res.status);
	  console.log('Follow-up response body:', text);
	  return res;
	} catch (err) {
	  console.error('Failed to send follow-up:', err);
	}
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
    return handleCommand(interaction, env);
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

async function handleCommand(interaction, env) {
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

	// Immediately process command asynchronously
	processCommand(interaction, env).catch(err => console.error('Command error:', err));

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

async function processCommand(interaction, env) {
	const name = interaction.data.name;
	const userId = interaction.member?.user?.id;
	const token = interaction.token;
  
	console.log(`Processing command: ${name} for user: ${userId}`);
	let content = '';
  
	switch (name) { 
	  case 'playnow':
		content = `🎮 <@${userId}>, your immediate play session is set!`;
		break;
	  case 'plan':
		content = `📅 <@${userId}>, your game night has been scheduled!`;
		break;
	  case 'list':
		// Example: fetch events from Supabase
		// const events = await env.SUPABASE.getEvents();
		content = `📝 <@${userId}>, here are all active events:\n- Event #1001\n- Event #1002`;
		break;
	  case 'guests':
		content = `👥 <@${userId}>, here’s the guest list for your event.`;
		break;
	  case 'invite':
		content = `📨 <@${userId}>, invitations sent!`;
		break;
	  case 'reschedule':
		content = `🔁 <@${userId}>, event has been rescheduled.`;
		break;
	  case 'delete':
		content = `🗑️ <@${userId}>, event deleted.`;
		break;
	  case 'achievements':
		content = `🏆 <@${userId}>, here are your achievements!`;
		break;
	  default:
		content = `❌ Unknown command: ${name}`;
	}
  
	// Send the follow-up message
	await sendFollowUp(token, content);
  }

async function handleButton(interaction, env) {
  const buttonId = interaction.data.custom_id;

  // Handle RSVP buttons
  if (buttonId.startsWith('rsvp_')) {
    const parts = buttonId.split('_');
    const action = parts[1]; // yes, maybe, no, reschedule
    const eventId = parts[2];

    // You'll need to implement the actual logic using env bindings (KV, D1, etc.)
    // For now, acknowledge the button press
    let message = '';
    switch (action) {
      case 'yes':
        message = `✅ You're in for event #${eventId}!`;
        break;
      case 'maybe':
        message = `🤔 Marked as maybe for event #${eventId}`;
        break;
      case 'no':
        message = `❌ You won't be attending event #${eventId}`;
        break;
      case 'reschedule':
        message = `🔁 To reschedule, use the \`/reschedule\` command with the event ID and new time.`;
        break;
      default:
        message = 'Unknown action';
    }

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
