const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getEvent, addInvited, addGuest, getUserGuestCount } = require('../utils/eventManager');
const { trackInviteSent } = require('../utils/achievementManager');

// Cloudflare-compatible handler function
// Returns { response, needsSave, updatedEvent } where needsSave indicates if event needs to be saved to KV
async function handleInviteCommandCloudflare(events, eventId, userId, username, personId, guestString) {
  const event = events[eventId];

  if (!event) {
    return {
      response: {
        content: `❌ Event #${eventId} not found.`,
        flags: 64 // EPHEMERAL
      }
    };
  }

  if (personId && guestString) {
    return {
      response: {
        content: `⚠️ Choose either **@person** OR **+guests**, not both.`,
        flags: 64 // EPHEMERAL
      }
    };
  }

  if (!personId && !guestString) {
    return {
      response: {
        content: `⚠️ Please tag a person or add guests (+1, +2).`,
        flags: 64 // EPHEMERAL
      }
    };
  }

  // Server member invite
  if (personId) {
    if (personId === userId) {
      return {
        response: {
          content: `⚠️ You can't invite yourself!`,
          flags: 64 // EPHEMERAL
        }
      };
    }

    // Add to invited list
    if (!event.invited.includes(personId)) {
      event.invited.push(personId);
    }
    
    // Track achievement (simplified for Cloudflare - would need achievement manager)
    let replyText = `📩 Invited <@${personId}> to event #${eventId}!`;
    
    return {
      response: { content: replyText },
      needsSave: true,
      updatedEvent: event
    };
  }

  // Outside guest invite
  if (!/^\+\d+$/.test(guestString.trim())) {
    return {
      response: {
        content: `⚠️ Invalid format. Use +1, +2, etc.`,
        flags: 64 // EPHEMERAL
      }
    };
  }

  const guestCount = parseInt(guestString.replace('+', ''), 10);
  
  // Check current total for this user in this event
  const currentTotal = (event.guests || [])
    .filter(g => g.userId === userId)
    .reduce((total, g) => total + g.count, 0);
  const newTotal = currentTotal + guestCount;
  
  if (newTotal > 5) {
    const remaining = 5 - currentTotal;
    if (remaining <= 0) {
      return {
        response: {
          content: `⚠️ You've already invited the maximum of **5 guests** for this event.`,
          flags: 64 // EPHEMERAL
        }
      };
    } else {
      return {
        response: {
          content: `⚠️ You can only invite **${remaining} more guest(s)** for this event (currently at ${currentTotal}/5).`,
          flags: 64 // EPHEMERAL
        }
      };
    }
  }

  // Add guest
  if (!event.guests) event.guests = [];
  event.guests.push({ userId, username, count: guestCount });

  let replyText = `🌐 ${username} invited **${guestString}** guest(s) to event #${eventId} (${newTotal}/5 total).`;

  return {
    response: { content: replyText },
    needsSave: true,
    updatedEvent: event
  };
}

// Original Discord.js handler
async function executeInviteCommand(interaction) {
  const id = interaction.options.getString('id').replace('#', '');
  const event = getEvent(id);

  if (!event) {
    return interaction.reply({ content: `❌ Event #${id} not found.`, flags: MessageFlags.Ephemeral });
  }

  const person = interaction.options.getUser('person');
  const guest = interaction.options.getString('guest');

  if (person && guest) {
    return interaction.reply({ 
      content: `⚠️ Choose either **@person** OR **+guests**, not both.`, 
      flags: MessageFlags.Ephemeral 
    });
  }

  if (!person && !guest) {
    return interaction.reply({ 
      content: `⚠️ Please tag a person or add guests (+1, +2).`, 
      flags: MessageFlags.Ephemeral 
    });
  }

  // Server member invite
  if (person) {
    if (person.id === interaction.user.id) {
      return interaction.reply({ 
        content: `⚠️ You can't invite yourself!`, 
        flags: MessageFlags.Ephemeral 
      });
    }

    addInvited(id, person.id);
    
    // Track achievement
    const achievements = trackInviteSent(interaction.user.id, 1);
    let replyText = `📩 Invited <@${person.id}> to event #${id}!`;
    if (achievements.length > 0) {
      const achievementText = achievements.map(a => `<@${interaction.user.id}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
      replyText += `\n\n${achievementText}`;
    }
    
    return interaction.reply(replyText);
  }

  // Outside guest invite
  if (!/^\+\d+$/.test(guest.trim())) {
    return interaction.reply({ 
      content: `⚠️ Invalid format. Use +1, +2, etc.`, 
      flags: MessageFlags.Ephemeral 
    });
  }

  const guestCount = parseInt(guest.replace('+', ''), 10);
  
  // Check current total for this user in this event
  const currentTotal = getUserGuestCount(id, interaction.user.id);
  const newTotal = currentTotal + guestCount;
  
  if (newTotal > 5) {
    const remaining = 5 - currentTotal;
    if (remaining <= 0) {
      return interaction.reply({ 
        content: `⚠️ You've already invited the maximum of **5 guests** for this event.`, 
        flags: MessageFlags.Ephemeral 
      });
    } else {
      return interaction.reply({ 
        content: `⚠️ You can only invite **${remaining} more guest(s)** for this event (currently at ${currentTotal}/5).`, 
        flags: MessageFlags.Ephemeral 
      });
    }
  }

  // Track guest locally, no Discord invite link
  addGuest(id, interaction.user.id, interaction.user.username, guestCount);

  // Track achievement
  const achievements = trackInviteSent(interaction.user.id, guestCount);
  let replyText = `🌐 ${interaction.user.username} invited **${guest}** guest(s) to event #${id} (${newTotal}/5 total).`;
  if (achievements.length > 0) {
    const achievementText = achievements.map(a => `<@${interaction.user.id}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
    replyText += `\n\n${achievementText}`;
  }

  return interaction.reply(replyText);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Invite people to your game night')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Event ID (e.g. 1001)')
        .setRequired(true)
    )
    .addUserOption(option =>
      option.setName('person')
        .setDescription('Tag a server member')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('guest')
        .setDescription('Outside guests (e.g. +1, +2)')
        .setRequired(false)
    ),
  execute: executeInviteCommand,
  handleCloudflare: handleInviteCommandCloudflare
};
