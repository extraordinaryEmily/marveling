const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');
const {
  createEvent,
  deleteEvent,
  addInvited,
  addAttendee,
  removeAttendee,
  setReminder,
  cancelReminder,
  getEvent
} = require('../utils/eventManager');
const { isValidDateTime, validateAndAdjustEventTime, scheduleReminder, setupRSVPCollector, parsePST } = require('../utils/helper');
const { trackHostCreated, checkMoonKnight, checkWakandaStrategist, trackHostWithTimestamp } = require('../utils/achievementManager');
const chrono = require('chrono-node');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('create')
    .setDescription('Create a new Marvel Rivals play session or game night'),

  async execute(interaction) {
    const role = interaction.guild.roles.cache.find(r => r.name === 'rivaling');
    const rolePing = role ? `<@&${role.id}>` : '@rivaling';

    // Show button selection: Play Now or Plan Game Night
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('play_now').setLabel('Play Now').setEmoji('🕹').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('plan_game_night').setLabel('Plan Game Night').setEmoji('📅').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ content: 'Play now or later?', components: [buttons], flags: MessageFlags.Ephemeral });

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
          content: 'When do you want to play?\n💡 (All times are PST)',
          flags: MessageFlags.Ephemeral
        });

        const msgCollector = interaction.channel.createMessageCollector({
          filter: m => m.author.id === interaction.user.id,
          time: 60000
        });

        msgCollector.on('collect', async m => {
          const time = m.content.trim();

          if (!isValidDateTime(time)) {
            await interaction.followUp({
              content: `❌ "${time}" doesn't look valid. Try "today 5PM", "Friday 8PM" or "10/18 5PM".`,
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          // Validate and adjust time
          const { eventTime: utcDate, debugInfo } = validateAndAdjustEventTime(time);

          if (!utcDate) {
            let errorMsg;
            if (debugInfo.isTooFarInFuture) errorMsg = `❌ Too far in the future!`;
            else if (debugInfo.explicitToday) errorMsg = `❌ That time has already passed today!`;
            else errorMsg = `❌ Unable to schedule for that time.`;

            await interaction.followUp({ content: errorMsg, flags: MessageFlags.Ephemeral });
            return;
          }

          msgCollector.stop();
          await m.delete().catch(() => {});

          const id = createEvent(interaction.user.id, 'planned', time);

          // Track achievements
          const achievements = trackHostCreated(interaction.user.id);
          const pstHour = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false });
          achievements.push(...checkMoonKnight(interaction.user.id, parseInt(pstHour)));

          const daysInAdvance = (utcDate - Date.now()) / (1000 * 60 * 60 * 24);
          achievements.push(...checkWakandaStrategist(interaction.user.id, daysInAdvance));
          achievements.push(...trackHostWithTimestamp(interaction.user.id));

          if (achievements.length > 0) {
            const achievementText = achievements.map(a => `${interaction.user} unlocked ${a.emoji} **${a.name}**!`).join('\n');
            await interaction.followUp({ content: achievementText });
          }

          // Invite members
          if (role) role.members.forEach(member => addInvited(id, member.id));
          addInvited(id, interaction.user.id);

          const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('📅 Marvel Rivals Game Night')
            .addFields(
              { name: 'Event ID', value: `#${id}` },
              { name: 'RSVP', value: "✅ Available | 🤔 Maybe | ❌ Can't make it | 🔁 Reschedule" }
            );

          const msg = await interaction.channel.send({
            content: `${rolePing} — ${interaction.user} is planning a game night!\n🗓 **Time:** ${time} (PST)`,
            embeds: [embed],
            allowedMentions: { parse: ['roles'] }
          });

          for (const e of ['✅', '🤔', '❌', '🔁']) await msg.react(e);
          setupRSVPCollector(msg, interaction, rolePing, id, role, 'planned', time);
          scheduleReminder(id, time, interaction.channel, rolePing, interaction.user);
        });

        msgCollector.on('end', c => {
          if (c.size === 0)
            interaction.followUp({ content: '⏰ Timed out. Try `/create` again.', flags: MessageFlags.Ephemeral });
        });
      }

      // ===============================
      // PLAY NOW FLOW
      // ===============================
      else if (btn.customId === 'play_now') {
        const id = createEvent(interaction.user.id, 'now', Date.now());
        
        // Track achievements
        const achievements = trackHostCreated(interaction.user.id);
        
        // Check Moon Knight (midnight-4am PST)
        const pstHour = new Date().toLocaleString('en-US', { 
          timeZone: 'America/Los_Angeles', 
          hour: 'numeric', 
          hour12: false 
        });
        const hour = parseInt(pstHour);
        const moonKnight = checkMoonKnight(interaction.user.id, hour);
        achievements.push(...moonKnight);
        
        // Track host frequency (5 in 7 days)
        const againAchievement = trackHostWithTimestamp(interaction.user.id);
        achievements.push(...againAchievement);
        
        if (achievements.length > 0) {
          const achievementText = achievements.map(a => `${interaction.user} unlocked ${a.emoji} **${a.name}**!`).join('\n');
          await interaction.followUp({
            content: achievementText
          });
        }
        
        addInvited(id, interaction.user.id);
        if (role) {
          await interaction.guild.members.fetch();
          role.members.forEach(member => addInvited(id, member.id));
        }

        const embed = new EmbedBuilder()
          .setColor(0x00aeff)
          .setTitle('⚡ Avengers assemble!')
          .setImage('https://i.imgur.com/pMPmPef.gif')
          .addFields(
            { name: 'Event ID', value: `#${id}` }
          );

        const msg = await interaction.channel.send({
          content: `${rolePing} — ${interaction.user} needs heroes! **Assemble NOW or react!**`,
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
