const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEvent, addInvited, addAttendee, removeAttendee } = require('../utils/eventManager');

/**
 * Validates if a string contains a legitimate date/time format
 * @param {string} str - The string to validate
 * @returns {boolean} - True if valid date/time format
 */
function isValidDateTime(str) {
  if (!str || str.length < 4) return false;
  
  const lower = str.toLowerCase();
  const daysOfWeek = ['monday','mon','tuesday','tue','tues','wednesday','wed','thursday','thu','thurs',
                      'friday','fri','saturday','sat','sunday','sun'];
  const hasDayOfWeek = daysOfWeek.some(day => lower.includes(day));
  
  const months = ['january','jan','february','feb','march','mar','april','apr','may',
                  'june','jun','july','jul','august','aug','september','sept','sep',
                  'october','oct','november','nov','december','dec'];
  const hasMonth = months.some(month => lower.includes(month));
  
  const hasDatePattern = /\d{1,2}[\/\-]\d{1,2}/.test(str);
  const hasTimePattern = /\d{1,2}(:\d{2})?\s*(am|pm|AM|PM)|^.*\d{1,2}:\d{2}.*$/.test(str);
  const hasRelativeDay = /\b(today|tomorrow|tonight|tmr|tmrw)\b/i.test(lower);
  
  const hasDateIndicator = hasDayOfWeek || hasMonth || hasDatePattern || hasRelativeDay;
  if (!hasTimePattern || !hasDateIndicator) return false;
  
  return true;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('create')
    .setDescription('Create a new Marvel Rivals play session or game night'),

  async execute(interaction) {
    const role = interaction.guild.roles.cache.find(r => r.name === "rivaling");
    const rolePing = role ? `<@&${role.id}>` : '@rivaling';

    // Initial prompt
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('play_now')
          .setLabel('Play Now')
          .setEmoji('🕹')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('plan_game_night')
          .setLabel('Plan Game Night')
          .setEmoji('📅')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.reply({
      content: 'Play now or later?',
      components: [row],
      ephemeral: true
    });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      max: 1,
      time: 20000
    });

    collector.on('collect', async buttonInteraction => {
      await buttonInteraction.deferUpdate();

      if (buttonInteraction.customId === 'play_now') {
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

      } else if (buttonInteraction.customId === 'plan_game_night') {
        // ===== PLAN GAME NIGHT FLOW =====
        await interaction.followUp({
          content:
            'When would you like to play? (e.g., **Friday 8PM**, **10/18 5PM**, **Oct 19th 3pm**, **Monday 1am**)\nPlease respond in the channel with a date and time.',
          ephemeral: true
        });

        const msgCollector = interaction.channel.createMessageCollector({
          filter: m => m.author.id === interaction.user.id,
          time: 60000
        });

        let validResponseReceived = false;

        msgCollector.on('collect', async m => {
          if (validResponseReceived) return;
          const time = m.content.trim();
          
          // Validate the time format
          if (!isValidDateTime(time)) {
            await interaction.followUp({
              content: `❌ "${time}" doesn't look like a valid date/time. Try again with something like **Friday 8PM**.`,
              ephemeral: true
            });
            return;
          }

          validResponseReceived = true;
          msgCollector.stop();
          await m.delete().catch(() => {});

          const id = createEvent(interaction.user.id, 'planned', time);

          addInvited(id, interaction.user.id);
          if (role) role.members.forEach(member => addInvited(id, member.id));

          const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('📅 Marvel Rivals Game Night')
            .addFields(
              { name: 'Event ID', value: `#${id}` },
              { name: 'RSVP', value: '✅ Available | 🤔 Maybe | ❌ Can\'t make it | 🔁 Suggest new time' }
            )
            .setTimestamp();

          const msg = await interaction.channel.send({
            content: `${rolePing} — ${interaction.user} is planning a game night!\n🗓 **Time:** ${time}`,
            embeds: [embed],
            allowedMentions: { parse: ['roles'] }
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

        msgCollector.on('end', () => {
          if (!validResponseReceived) {
            interaction.followUp({
              content: '⏰ Time expired. Please use `/create` again to plan a game night.',
              ephemeral: true
            });
          }
        });
      }
    });

    collector.on('end', collected => {
      if (collected.size === 0) {
        interaction.editReply({ content: '⏰ No response. Command cancelled.', components: [] });
      }
    });
  }
};
