const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { createEvent, addInvited, addAttendee, removeAttendee } = require('../utils/eventManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('create')
    .setDescription('Create a new Marvel Rivals play session or game night'),

  async execute(interaction) {
    const role = interaction.guild.roles.cache.find(r => r.name === "rivaling");
    const rolePing = role ? `<@&${role.id}>` : '@rivaling';

    // Send the prompt as a regular message
    const prompt = await interaction.channel.send(
      `${interaction.user} — Do you want to **play now** or **plan a game night**?\n🕹 = Play Now | 📅 = Plan Game Night`
    );

    await prompt.react('🕹');
    await prompt.react('📅');

    const filter = (reaction, user) =>
      ['🕹', '📅'].includes(reaction.emoji.name) && user.id === interaction.user.id;

    const collector = prompt.createReactionCollector({ filter, max: 1, time: 20000 });

    collector.on('collect', async reaction => {
      if (reaction.emoji.name === '🕹') {
        // ===== PLAY NOW FLOW =====
        const id = createEvent(interaction.user.id, 'now');

        // Add the creator to invited
        addInvited(id, interaction.user.id);

        // Add all @rivaling members to invited
        if (role) {
          await interaction.guild.members.fetch();
          role.members.forEach(member => addInvited(id, member.id));
        }

        const embed = new EmbedBuilder()
          .setColor(0x00aeff)
          .setTitle(`🕹 Marvel Rivals LFG`)
          .addFields(
            { name: 'Event ID', value: `#${id}` },
            { name: 'RSVP', value: '✅ Available | ❌ Cannot join' }
          )
          .setTimestamp();

        const msg = await interaction.channel.send({
          content: `${rolePing} — ${interaction.user} wants to play **right now!**\nReact if you’re available!`,
          embeds: [embed],
          allowedMentions: { parse: ['roles'] },
        });

        await msg.react('✅');
        await msg.react('❌');

        // RSVP collector
        const rsvpFilter = (reaction, user) =>
          ['✅', '❌'].includes(reaction.emoji.name) && !user.bot;

        const rsvpCollector = msg.createReactionCollector({ filter: rsvpFilter, dispose: true });

        rsvpCollector.on('collect', (reaction, user) => {
          if (reaction.emoji.name === '✅') addAttendee(id, user.id);
          else if (reaction.emoji.name === '❌') removeAttendee(id, user.id);

          // Remove conflicting reactions for the user
          msg.reactions.cache.forEach(r => {
            if (r.emoji.name !== reaction.emoji.name && ['✅', '❌'].includes(r.emoji.name)) {
              r.users.remove(user.id).catch(() => {});
            }
          });
        });

        rsvpCollector.on('remove', (reaction, user) => {
          if (reaction.emoji.name === '✅') removeAttendee(id, user.id);
        });

      } else if (reaction.emoji.name === '📅') {
        // ===== PLAN GAME NIGHT FLOW =====
        const ask = await interaction.channel.send(`${interaction.user} — When would you like to play? (e.g. Friday 8PM)`);

        const msgCollector = interaction.channel.createMessageCollector({
          filter: m => m.author.id === interaction.user.id,
          max: 1,
          time: 30000,
        });

        msgCollector.on('collect', async m => {
          const time = m.content;
          const id = createEvent(interaction.user.id, 'planned', time);

          addInvited(id, interaction.user.id);
          if (role) role.members.forEach(member => addInvited(id, member.id));

          const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('📅 Marvel Rivals Game Night')
            .addFields(
              { name: 'Event ID', value: `#${id}` },
              { name: 'RSVP', value: '✅ Available | 🤔 Maybe | ❌ Can’t make it | 🔁 Suggest new time' }
            )
            .setTimestamp();

          const msg = await interaction.channel.send({
            content: `${rolePing} — ${interaction.user} is planning a game night!\n🗓 **Time:** ${time}`,
            embeds: [embed],
            allowedMentions: { parse: ['roles'] },
          });

          await msg.react('✅');
          await msg.react('🤔');
          await msg.react('❌');
          await msg.react('🔁');

          // RSVP collector
          const rsvpFilter = (reaction, user) =>
            ['✅', '🤔', '❌', '🔁'].includes(reaction.emoji.name) && !user.bot;

          const rsvpCollector = msg.createReactionCollector({ filter: rsvpFilter, dispose: true });

          rsvpCollector.on('collect', (reaction, user) => {
            if (reaction.emoji.name === '✅') addAttendee(id, user.id);
            else if (reaction.emoji.name === '❌') removeAttendee(id, user.id);

            // Remove conflicting RSVP emojis
            msg.reactions.cache.forEach(r => {
              if (r.emoji.name !== reaction.emoji.name && ['✅', '🤔', '❌'].includes(r.emoji.name)) {
                r.users.remove(user.id).catch(() => {});
              }
            });
          });

          rsvpCollector.on('remove', (reaction, user) => {
            if (reaction.emoji.name === '✅') removeAttendee(id, user.id);
          });
        });
      }
    });

    collector.on('end', collected => {
      if (collected.size === 0) {
        interaction.channel.send('⏰ No response. Command cancelled.');
      }
    });

    // Confirm command execution
    await interaction.reply({ content: '✅ Event creation prompt sent!', ephemeral: true });
  },
};
