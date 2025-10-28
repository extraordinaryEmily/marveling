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
const { registerCommandState, completeUserCommand } = require('../utils/commandStateManager');
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
      new ButtonBuilder().setCustomId('create_play_now').setLabel('Play Now').setEmoji('🕹').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('create_plan_game_night').setLabel('Plan Game Night').setEmoji('📅').setStyle(ButtonStyle.Secondary)
    );

    // Store initial state with guild and role info
    registerCommandState(interaction.user.id, 'create', { 
      step: 'awaiting_button',
      guildId: interaction.guild.id,
      channelId: interaction.channel.id,
      rolePing: rolePing,
      roleId: role?.id
    });

    await interaction.reply({ 
      content: 'Play now or later?', 
      components: [buttons], 
      flags: MessageFlags.Ephemeral
    });
  },

  // Handle the button interactions (called from index.js)
  async handleButton(interaction, client, buttonId) {
    const { getUserCommandState } = require('../utils/commandStateManager');
    const commandState = getUserCommandState(interaction.user.id);
    
    if (!commandState || commandState.commandName !== 'create') {
      return interaction.reply({
        content: '❌ This interaction has expired. Please run `/create` again.',
        flags: MessageFlags.Ephemeral
      });
    }

    const state = commandState.collectors; // Our state data is stored in collectors param
    const guild = await client.guilds.fetch(state.guildId);
    const channel = await client.channels.fetch(state.channelId);
    const role = state.roleId ? guild.roles.cache.get(state.roleId) : null;
    const rolePing = state.rolePing;

    // ===============================
    // PLAY NOW FLOW
    // ===============================
    if (buttonId === 'create_play_now') {
      await interaction.deferUpdate();
      
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
        const achievementText = achievements.map(a => `<@${interaction.user.id}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
        await channel.send(achievementText);
      }
      
      addInvited(id, interaction.user.id);
      if (role) {
        await guild.members.fetch();
        role.members.forEach(member => addInvited(id, member.id));
      }

      const embed = new EmbedBuilder()
        .setColor(0x00aeff)
        .setTitle('⚡ Avengers assemble!')
        .setImage('https://i.imgur.com/pMPmPef.gif')
        .addFields(
          { name: 'Event ID', value: `#${id}` }
        );

      const msg = await channel.send({
        content: `${rolePing} — <@${interaction.user.id}> needs heroes! **Assemble NOW or react!**`,
        embeds: [embed],
        allowedMentions: { parse: ['roles'] }
      });

      for (const e of ['✅', '❌']) await msg.react(e);
      setupRSVPCollector(msg, { 
        user: { id: interaction.user.id }, 
        guild: guild, 
        channel: channel 
      }, rolePing, id, role, 'now');
      
      // Update the ephemeral message
      await interaction.editReply({ 
        content: '✅ Event created! Check the channel.', 
        components: [] 
      });
      
      // Command completed successfully
      completeUserCommand(interaction.user.id);
    }

    // ===============================
    // PLAN GAME NIGHT FLOW
    // ===============================
    else if (buttonId === 'create_plan_game_night') {
      await interaction.update({
        content: '📅 When do you want to play?\n💡 Type your answer in the channel (e.g., "Friday 8PM" or "Oct 18 5PM")\n💡 All times are PST',
        components: []
      });

      // Update state to wait for message
      registerCommandState(interaction.user.id, 'create', {
        step: 'awaiting_time',
        guildId: state.guildId,
        channelId: state.channelId,
        rolePing: rolePing,
        roleId: state.roleId,
        timestamp: Date.now()
      });
    }
  },

  // Handle the time message (called from index.js message event)
  async handleTimeMessage(message, client) {
    const { getUserCommandState } = require('../utils/commandStateManager');
    const commandState = getUserCommandState(message.author.id);
    
    if (!commandState || commandState.commandName !== 'create' || !commandState.collectors) {
      return false; // Not handling this message
    }

    const state = commandState.collectors; // Our state data is stored in collectors param
    
    if (state.step !== 'awaiting_time') {
      return false; // Not waiting for time input
    }

    // Check if message is in the right channel
    if (message.channel.id !== state.channelId) {
      return false;
    }

    // Timeout after 60 seconds
    if (Date.now() - state.timestamp > 60000) {
      completeUserCommand(message.author.id);
      await message.channel.send(`<@${message.author.id}> ⏰ Timed out. Try \`/create\` again.`);
      return true;
    }

    const time = message.content.trim();

    if (!isValidDateTime(time)) {
      await message.reply(`❌ "${time}" doesn't look valid. Try "today 5PM", "Friday 8PM" or "10/18 5PM".`);
      return true; // We handled it, but keep waiting
    }

    // Validate and adjust time
    const { eventTime: utcDate, debugInfo } = validateAndAdjustEventTime(time);

    if (!utcDate) {
      let errorMsg;
      if (debugInfo.isTooFarInFuture) errorMsg = `❌ Too far in the future!`;
      else if (debugInfo.explicitToday) errorMsg = `❌ That time has already passed today!`;
      else errorMsg = `❌ Unable to schedule for that time.`;

      await message.reply(errorMsg);
      return true; // We handled it, but keep waiting
    }

    // Delete the user's message
    await message.delete().catch(() => {});

    // Create the event
    const guild = await client.guilds.fetch(state.guildId);
    const channel = await client.channels.fetch(state.channelId);
    const role = state.roleId ? guild.roles.cache.get(state.roleId) : null;
    const rolePing = state.rolePing;

    const id = createEvent(message.author.id, 'planned', time);

    // Track achievements
    const achievements = trackHostCreated(message.author.id);
    const pstHour = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false });
    achievements.push(...checkMoonKnight(message.author.id, parseInt(pstHour)));

    const daysInAdvance = (utcDate - Date.now()) / (1000 * 60 * 60 * 24);
    achievements.push(...checkWakandaStrategist(message.author.id, daysInAdvance));
    achievements.push(...trackHostWithTimestamp(message.author.id));

    if (achievements.length > 0) {
      const achievementText = achievements.map(a => `<@${message.author.id}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
      await channel.send(achievementText);
    }

    // Invite members
    if (role) role.members.forEach(member => addInvited(id, member.id));
    addInvited(id, message.author.id);

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('📅 Marvel Rivals Game Night')
      .addFields(
        { name: 'Event ID', value: `#${id}` },
        { name: 'RSVP', value: "✅ Available | 🤔 Maybe | ❌ Can't make it | 🔁 Reschedule" }
      );

    const msg = await channel.send({
      content: `${rolePing} — <@${message.author.id}> is planning a game night!\n🗓 **Time:** ${time} (PST)`,
      embeds: [embed],
      allowedMentions: { parse: ['roles'] }
    });

    for (const e of ['✅', '🤔', '❌', '🔁']) await msg.react(e);
    setupRSVPCollector(msg, { 
      user: { id: message.author.id }, 
      guild: guild, 
      channel: channel 
    }, rolePing, id, role, 'planned', time);
    scheduleReminder(id, time, channel, rolePing, { id: message.author.id });
    
    // Command completed successfully
    completeUserCommand(message.author.id);
    return true; // We handled this message
  }
};
