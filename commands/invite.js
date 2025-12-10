const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getEvent, addInvited, addGuest, getUserGuestCount } = require('../utils/eventManager');
const { trackInviteSent } = require('../utils/achievementManager');

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

  async execute(interaction) {
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
  },
};

