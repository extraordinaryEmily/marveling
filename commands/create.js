const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const {
  createEvent,
  deleteEvent,
  addInvited,
  addAttendee,
  removeAttendee
} = require('../utils/eventManager');

/**
 * Validates if a string contains a legitimate date/time format.
 */
function isValidDateTime(str) {
  if (!str || str.length < 4) return false;

  const lower = str.toLowerCase();
  const daysOfWeek = ['monday','mon','tuesday','tue','tues','wednesday','wed','thursday','thu','thurs','friday','fri','saturday','sat','sunday','sun'];
  const months = ['january','jan','february','feb','march','mar','april','apr','may','june','jun','july','jul','august','aug','september','sept','sep','october','oct','november','nov','december','dec'];

  const hasDayOfWeek = daysOfWeek.some(day => lower.includes(day));
  const hasMonth = months.some(month => lower.includes(month));
  const hasDatePattern = /\d{1,2}[\/\-]\d{1,2}/.test(str);
  const hasTimePattern = /\d{1,2}(:\d{2})?\s*(am|pm)|\d{1,2}:\d{2}/i.test(str);
  const hasRelativeDay = /\b(today|tomorrow|tonight|tmr|tmrw)\b/i.test(lower);

  const hasDateIndicator = hasDayOfWeek || hasMonth || hasDatePattern || hasRelativeDay;
  return hasDateIndicator && hasTimePattern;
}

/**
 * Adds RSVP collectors for reactions and handles reschedule prompts.
 */
function setupRSVPCollector(msg, interaction, rolePing, id, role, eventType, time) {
  const isPlanned = eventType === 'planned';
  const rsvpEmojis = isPlanned ? ['✅', '🤔', '❌', '🔁'] : ['✅', '❌'];
  const counts = Object.fromEntries(rsvpEmojis.map(e => [e, 0]));

  const filter = (reaction, user) => rsvpEmojis.includes(reaction.emoji.name) && !user.bot;
  const collector = msg.createReactionCollector({ filter, dispose: true });

  let reschedulePrompted = false;

  const shouldPromptReschedule = () => {
    if (!isPlanned) return false;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total < 5) return false;
    const available = counts['✅'] / total;
    const conflict = (counts['❌'] + counts['🤔']) / total;
    const suggestNew = counts['🔁'] / total;
    return available < 0.4 || conflict > 0.5 || suggestNew >= 0.25;
  };

  collector.on('collect', (reaction, user) => {
    counts[reaction.emoji.name]++;
    if (reaction.emoji.name === '✅') addAttendee(id, user.id);
    else if (reaction.emoji.name === '❌') removeAttendee(id, user.id);

    // Remove conflicting RSVPs
    msg.reactions.cache.forEach(r => {
      if (r.emoji.name !== reaction.emoji.name && rsvpEmojis.includes(r.emoji.name)) {
        r.users.remove(user.id).catch(() => {});
      }
    });

    // Handle rescheduling prompt
    if (isPlanned && !reschedulePrompted && shouldPromptReschedule()) {
      reschedulePrompted = true;
      interaction.channel.send(
        `🕓 Not everyone can make it!\n<@${interaction.user.id}>, should we reschedule?\nReply with a date + time.`
      );

      const msgCollector = interaction.channel.createMessageCollector({
        filter: m => m.author.id === interaction.user.id,
        time: 60000,
      });

      msgCollector.on('collect', async m => {
        const input = m.content.trim().toLowerCase();

        // Handle cancellation
        if (input === 'no' || input === 'n') {
          await m.delete().catch(() => {});
          msgCollector.stop('cancel');
          await interaction.followUp({
            content: '🛑 Reschedule cancelled.',
            ephemeral: true
          });
          return;
        }

        // Handle invalid time
        if (!isValidDateTime(input)) {
          await interaction.followUp({
            content: `❌ "${m.content.trim()}" is not a valid date/time. Try again or type "no" to cancel.`,
            ephemeral: true
          });
          return;
        }

        // Handle valid reschedule
        await m.delete().catch(() => {});
        msgCollector.stop('reschedule');

        // Delete old event and message
        deleteEvent(id);
        await msg.delete().catch(() => {});

        // Create new event
        const newId = createEvent(interaction.user.id, 'planned', input);
        if (role) role.members.forEach(member => addInvited(newId, member.id));
        addInvited(newId, interaction.user.id);

        // Send new event message
        const newEmbed = new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle('🔁 Marvel Rivals Game Night (Rescheduled)')
          .addFields(
            { name: 'Event ID', value: `#${newId}` },
            { name: 'RSVP', value: '✅ Available | 🤔 Maybe | ❌ Can’t make it | 🔁 Reschedule' }
          )
          .setTimestamp();

        const newMsg = await interaction.channel.send({
          content: `🔁 <@${interaction.user.id}> **rescheduled!**\n🗓 **Time:** ${input}\n${rolePing}`,
          embeds: [newEmbed],
          allowedMentions: { parse: ['roles'] }
        });

        // Add reactions
        for (const e of ['✅', '🤔', '❌', '🔁']) await newMsg.react(e);

        // Start RSVP collector on new message
        setupRSVPCollector(newMsg, interaction, rolePing, newId, role, 'planned', input);

      });

      msgCollector.on('end', (_, reason) => {
        if (reason === 'time') {
          interaction.followUp({
            content: '⌛ Reschedule timed out.',
            ephemeral: true
          });
        }
      });
    }
  });

  collector.on('remove', (reaction, user) => {
    counts[reaction.emoji.name] = Math.max(counts[reaction.emoji.name] - 1, 0);
    if (reaction.emoji.name === '✅') removeAttendee(id, user.id);
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('create')
    .setDescription('Create a new Marvel Rivals play session or game night'),

  async execute(interaction) {
    const role = interaction.guild.roles.cache.find(r => r.name === 'rivaling');
    const rolePing = role ? `<@&${role.id}>` : '@rivaling';

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('play_now').setLabel('Play Now').setEmoji('🕹').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('plan_game_night').setLabel('Plan Game Night').setEmoji('📅').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ content: 'Play now or later?', components: [buttons], ephemeral: true });

    const collector = interaction.channel.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      max: 1,
      time: 20000
    });

    collector.on('collect', async btn => {
      await btn.deferUpdate();

      // ===============================
      // PLAN GAME NIGHT FLOW
      // ===============================
      if (btn.customId === 'plan_game_night') {
        await interaction.followUp({
          content: 'When do you want to play?',
          ephemeral: true
        });

        const msgCollector = interaction.channel.createMessageCollector({
          filter: m => m.author.id === interaction.user.id,
          time: 60000
        });

        msgCollector.on('collect', async m => {
          const time = m.content.trim();
          if (!isValidDateTime(time)) {
            await interaction.followUp({
              content: `❌ "${time}" doesn’t look valid. Try "Friday 8PM" or "10/18 5PM".`,
              ephemeral: true
            });
            return;
          }

          msgCollector.stop();
          await m.delete().catch(() => {});
          const id = createEvent(interaction.user.id, 'planned', time);
          if (role) role.members.forEach(member => addInvited(id, member.id));
          addInvited(id, interaction.user.id);

          const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('📅 Marvel Rivals Game Night')
            .addFields(
              { name: 'Event ID', value: `#${id}` },
              { name: 'RSVP', value: '✅ Available | 🤔 Maybe | ❌ Can’t make it | 🔁 Reschedule' }
            )
            .setTimestamp();

          const msg = await interaction.channel.send({
            content: `${rolePing} — ${interaction.user} is planning a game night!\n🗓 **Time:** ${time}`,
            embeds: [embed],
            allowedMentions: { parse: ['roles'] }
          });

          for (const e of ['✅', '🤔', '❌', '🔁']) await msg.react(e);
          setupRSVPCollector(msg, interaction, rolePing, id, role, 'planned', time);
        });

        msgCollector.on('end', c => {
          if (c.size === 0) interaction.followUp({ content: '⏰ Timed out. Try `/create` again.', ephemeral: true });
        });
      }

      // ===============================
      // PLAY NOW FLOW
      // ===============================
      else if (btn.customId === 'play_now') {
        const id = createEvent(interaction.user.id, 'now');
        addInvited(id, interaction.user.id);
        if (role) {
          await interaction.guild.members.fetch();
          role.members.forEach(member => addInvited(id, member.id));
        }

        const embed = new EmbedBuilder()
          .setColor(0x00aeff)
          .setTitle('🕹 Marvel Rivals LFG')
          .addFields(
            { name: 'Event ID', value: `#${id}` },
            { name: 'RSVP', value: '✅ Available | ❌ Cannot join' }
          )
          .setTimestamp();

        const msg = await interaction.channel.send({
          content: `${rolePing} — ${interaction.user} wants to play **right now!**\nReact if you’re available!`,
          embeds: [embed],
          allowedMentions: { parse: ['roles'] }
        });

        for (const e of ['✅', '❌']) await msg.react(e);
        setupRSVPCollector(msg, interaction, rolePing, id, role, 'now');
      }
    });

    collector.on('end', collected => {
      if (collected.size === 0)
        interaction.editReply({ content: '⏰ No response. Command cancelled.', components: [] });
    });
  }
};
