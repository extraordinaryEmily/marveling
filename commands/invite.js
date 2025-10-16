const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getEvent, addInvited, addGuest } = require('../utils/eventManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Invite people to your game night')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Event ID (e.g. 1001)')
        .setRequired(true)
    )
    .addMentionableOption(option =>
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

    const person = interaction.options.getMentionable('person');
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
      if (!person.user) {
        return interaction.reply({ 
          content: `⚠️ Cannot invite a role. Please tag a user.`, 
          flags: MessageFlags.Ephemeral 
        });
      }

      if (person.id === interaction.user.id) {
        return interaction.reply({ 
          content: `⚠️ You can't invite yourself!`, 
          flags: MessageFlags.Ephemeral 
        });
      }

      addInvited(id, person.id);
      return interaction.reply(`📩 Invited ${person} to event #${id}!`);
    }

    // Outside guest invite
    if (!/^\+\d+$/.test(guest.trim())) {
      return interaction.reply({ 
        content: `⚠️ Invalid format. Use +1, +2, etc.`, 
        flags: MessageFlags.Ephemeral 
      });
    }

    const guestCount = parseInt(guest.replace('+', ''), 10);
    const invite = await interaction.channel.createInvite({
      maxAge: 3600,
      maxUses: guestCount,
      unique: true,
    });

    addGuest(id, `${interaction.user.username} (${guest})`);

    await interaction.reply(
      `🌐 ${interaction.user.username} invited **${guest}** guest(s) to event #${id}.`
    );

    return interaction.followUp({
      content: `Here's the invite link (valid 1 hour):\n${invite.url}`,
      flags: MessageFlags.Ephemeral
    });
  },
};
