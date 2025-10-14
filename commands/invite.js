const { SlashCommandBuilder } = require('discord.js');
const { getEvent, addAttendee, addInvited, addGuest } = require('../utils/eventManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Invite someone to a Marveling event')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Event ID to invite them to (e.g. 1001)')
        .setRequired(true)
    )
    .addMentionableOption(option =>
      option.setName('person')
        .setDescription('Tag the person you want to invite (inside server)')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('guest')
        .setDescription('Invite outside guests (e.g. +1, +2)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const id = interaction.options.getString('id').replace('#', '');
    const event = getEvent(id);

    if (!event) {
      return interaction.reply({ content: `❌ Event #${id} not found.`, ephemeral: true });
    }

    const mention = interaction.options.getMentionable('person');
    const guestFlag = interaction.options.getString('guest');

    // Inside server invite
    if (mention) {
      if (!mention.user) {
        return interaction.reply({ content: `⚠️ Cannot invite a role directly.`, ephemeral: true });
      }

      addInvited(id, mention.id);
      await interaction.reply(`📩 Invited ${mention} to event #${id}!`);
      return;
    }

    // Outside guests (e.g. +1, +2)
    if (guestFlag && /^\+\d+$/.test(guestFlag.trim())) {
      const guestCount = parseInt(guestFlag.replace('+', ''), 10);

      // Create invite link limited to this channel
      const invite = await interaction.channel.createInvite({
        maxAge: 3600, // valid 1 hour
        maxUses: guestCount,
        unique: true,
      });

      addGuest(id, `${interaction.user.username} (${guestFlag})`);

      // Public announcement
      await interaction.reply(
        `🌐 ${interaction.user.username} invited **${guestFlag}** guest(s) to event #${id}.`
      );

      // Private follow-up with invite link
      await interaction.followUp({
        content: `Here's their invite link (valid 1 hour):\n${invite.url}`,
        ephemeral: true
      });
      
      return;
    }

    await interaction.reply({ content: `⚠️ Please tag a person or specify guest count (e.g. +1, +2).`, ephemeral: true });
  },
};
