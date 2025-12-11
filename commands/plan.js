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
  addInvited,
  addAttendee,
  removeAttendee
} = require('../utils/eventManager');
const { isValidDateTime, validateAndAdjustEventTime } = require('../utils/helper');
const { scheduleReminder: scheduleSupabaseReminder } = require('../utils/supabaseClient');
const { trackHostCreated, checkMoonKnight, checkWakandaStrategist, trackHostWithTimestamp } = require('../utils/achievementManager');

// Cloudflare-compatible handler function
// Returns { response, newEvent, reminderData, followUps } or { response: error }
function handlePlanCommandCloudflare(userId, time, nextEventId, roleId, channelId, eventTimeIso, reminderTimeIso) {
  // Validate time format (simplified - would need helper functions)
  if (!time || time.trim().length === 0) {
    return {
      response: {
        content: `❌ "${time}" doesn't look valid. Try "today 5PM", "Friday 8PM" or "10/18 5PM". All times are PST.`,
        flags: 64 // EPHEMERAL
      }
    };
  }

  const rolePing = roleId ? `<@&${roleId}>` : '@rivaling';
  const id = nextEventId;

  const embed = {
    color: 0xff0000,
    title: '📅 Marvel Rivals Game Night',
    fields: [
      { name: 'Event ID', value: `#${id}` },
      { name: 'RSVP', value: "✅ Available | 🤔 Maybe | ⛔ Can't make it | 🔁 Reschedule" }
    ]
  };

  const buttons = [
    {
      type: 1, // ACTION_ROW
      components: [
        {
          type: 2, // BUTTON
          style: 3, // SUCCESS
          label: 'Available',
          emoji: { name: '✅' },
          custom_id: `rsvp_yes_${id}`
        },
        {
          type: 2, // BUTTON
          style: 2, // SECONDARY
          label: 'Maybe',
          emoji: { name: '🤔' },
          custom_id: `rsvp_maybe_${id}`
        },
        {
          type: 2, // BUTTON
          style: 4, // DANGER
          label: "Can't make it",
          emoji: { name: '⛔' },
          custom_id: `rsvp_no_${id}`
        },
        {
          type: 2, // BUTTON
          style: 1, // PRIMARY
          label: 'Reschedule',
          emoji: { name: '🔁' },
          custom_id: `rsvp_reschedule_${id}`
        }
      ]
    }
  ];

  const newEvent = {
    id,
    creatorId: userId,
    type: 'planned',
    time: time,
    invited: [userId],
    attendees: [],
    guests: [],
    createdAt: Date.now(),
    channelId: channelId,
    eventTimeIso: eventTimeIso,
    reminderTime: reminderTimeIso
  };

  return {
    response: {
      content: `${rolePing} — <@${userId}> is planning a game night!\n🗓 **Time:** ${time} (PST)\n\n✅ Event #${id} created!`,
      embeds: [embed],
      components: buttons
    },
    newEvent: newEvent,
    reminderData: reminderTimeIso ? {
      eventId: id,
      reminderTime: reminderTimeIso,
      channelId: channelId,
      attendees: []
    } : null,
    followUps: [] // Would contain achievement notifications
  };
}

// Original Discord.js handler
async function executePlanCommand(interaction) {
    const time = interaction.options.getString('time').trim();

    // Validate time format
    if (!isValidDateTime(time)) {
      return interaction.reply({ 
        content: `❌ "${time}" doesn't look valid. Try "today 5PM", "Friday 8PM" or "10/18 5PM". All times are PST.`, 
        flags: MessageFlags.Ephemeral 
      });
    }

    // Validate and adjust time
    const { eventTime: utcDate, debugInfo } = validateAndAdjustEventTime(time);

    if (!utcDate) {
      let errorMsg;
      if (debugInfo.isTooFarInFuture) errorMsg = `❌ Too far in the future!`;
      else if (debugInfo.explicitToday) errorMsg = `❌ That time has already passed today!`;
      else errorMsg = `❌ Unable to schedule for that time.`;

      return interaction.reply({ content: errorMsg, flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    try {
      // Get role ID from environment (no gateway fetch)
      const rolePing = process.env.RIVALING_ROLE_ID ? `<@&${process.env.RIVALING_ROLE_ID}>` : '@rivaling';

      const id = createEvent(interaction.user.id, 'planned', time);

      // Track achievements
      const achievements = await trackHostCreated(interaction.user.id);
      const pstHour = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hour12: false });
      achievements.push(...(await checkMoonKnight(interaction.user.id, parseInt(pstHour))));

      const daysInAdvance = (utcDate - Date.now()) / (1000 * 60 * 60 * 24);
      achievements.push(...(await checkWakandaStrategist(interaction.user.id, daysInAdvance)));
      achievements.push(...(await trackHostWithTimestamp(interaction.user.id)));

      // Add host as invited (others will self-RSVP via buttons)
      addInvited(id, interaction.user.id);

      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('📅 Marvel Rivals Game Night')
        .addFields(
          { name: 'Event ID', value: `#${id}` },
          { name: 'RSVP', value: "✅ Available | 🤔 Maybe | ⛔ Can't make it | 🔁 Reschedule" }
        );

      // Create RSVP buttons
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`rsvp_yes_${id}`)
          .setLabel('Available')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`rsvp_maybe_${id}`)
          .setLabel('Maybe')
          .setEmoji('🤔')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`rsvp_no_${id}`)
          .setLabel("Can't make it")
          .setEmoji('⛔')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`rsvp_reschedule_${id}`)
          .setLabel('Reschedule')
          .setEmoji('🔁')
          .setStyle(ButtonStyle.Primary)
      );

      // Send via interaction response (gateway-free)
      await interaction.editReply({
        content: `${rolePing} — <@${interaction.user.id}> is planning a game night!\n🗓 **Time:** ${time} (PST)\n\n✅ Event #${id} created!`,
        embeds: [embed],
        components: [buttons]
      });

      // Schedule reminder in Supabase (no local timeout)
      const { DateTime } = require('luxon');
      const { eventTime: utcDate } = validateAndAdjustEventTime(time);
      if (utcDate) {
        const eventTime = DateTime.fromJSDate(utcDate).setZone('America/Los_Angeles');
        const reminderTime = eventTime.minus({ minutes: 25 });
        await scheduleSupabaseReminder(id, reminderTime.toISO(), interaction.channel.id, []);
      }
      
      // Send achievements as followUp if any
      if (achievements.length > 0) {
        const achievementText = achievements.map(a => `<@${interaction.user.id}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
        await interaction.followUp({ content: achievementText });
      }
      
    } catch (error) {
      console.error('Error creating planned event:', error);
      await interaction.editReply({
        content: '❌ Failed to create event: ' + error.message
      });
    }
  }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('plan')
    .setDescription('Plan a game night at a specific date/time')
    .addStringOption(option =>
      option.setName('time')
        .setDescription('When to play (e.g., "Friday 8PM", "Oct 18 5PM") - All times are PST')
        .setRequired(true)
    ),
  execute: executePlanCommand,
  handleCloudflare: handlePlanCommandCloudflare
};

