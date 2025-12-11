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
const { trackHostCreated, checkMoonKnight, trackHostWithTimestamp } = require('../utils/achievementManager');

// Cloudflare-compatible handler function
// Returns { response, newEvent, followUps }
function handlePlaynowCommandCloudflare(userId, username, roleId, nextEventId) {
  const rolePing = roleId ? `<@&${roleId}>` : '@rivaling';
  const id = nextEventId;

  const embed = {
    color: 0x00aeff,
    title: '⚡ Avengers assemble!',
    image: { url: 'https://i.imgur.com/pMPmPef.gif' },
    fields: [
      { name: 'Event ID', value: `#${id}` },
      { name: 'RSVP', value: "✅ I'm coming! | ⛔ Can't make it" }
    ]
  };

  const buttons = [
    {
      type: 1, // ACTION_ROW
      components: [
        {
          type: 2, // BUTTON
          style: 3, // SUCCESS
          label: "I'm coming!",
          emoji: { name: '✅' },
          custom_id: `rsvp_yes_${id}`
        },
        {
          type: 2, // BUTTON
          style: 4, // DANGER
          label: "Can't make it",
          emoji: { name: '⛔' },
          custom_id: `rsvp_no_${id}`
        }
      ]
    }
  ];

  const newEvent = {
    id,
    creatorId: userId,
    type: 'now',
    time: Date.now(),
    invited: [userId],
    attendees: [],
    guests: [],
    createdAt: Date.now(),
    channelId: null,
    eventTimeIso: null,
    reminderTime: null
  };

  return {
    response: {
      content: `${rolePing} — <@${userId}> needs heroes! **Assemble NOW!**`,
      embeds: [embed],
      components: buttons
    },
    newEvent: newEvent,
    followUps: [] // Would contain achievement notifications
  };
}

// Original Discord.js handler
async function executePlaynowCommand(interaction) {
    await interaction.deferReply();

    try {
      // Get role ID from environment (no gateway fetch)
      const rolePing = process.env.RIVALING_ROLE_ID ? `<@&${process.env.RIVALING_ROLE_ID}>` : '@rivaling';

      const id = createEvent(interaction.user.id, 'now', Date.now());
      
      // Track achievements
      const achievements = await trackHostCreated(interaction.user.id);
      
      // Check Moon Knight (midnight-4am PST)
      const pstHour = new Date().toLocaleString('en-US', { 
        timeZone: 'America/Los_Angeles', 
        hour: 'numeric', 
        hour12: false 
      });
      const hour = parseInt(pstHour);
      const moonKnight = await checkMoonKnight(interaction.user.id, hour);
      achievements.push(...moonKnight);
      
      // Track host frequency (5 in 7 days)
      const againAchievement = await trackHostWithTimestamp(interaction.user.id);
      achievements.push(...againAchievement);
      
      // Add host as invited (others will self-RSVP via buttons)
      addInvited(id, interaction.user.id);

      const embed = new EmbedBuilder()
        .setColor(0x00aeff)
        .setTitle('⚡ Avengers assemble!')
        .setImage('https://i.imgur.com/pMPmPef.gif')
        .addFields(
          { name: 'Event ID', value: `#${id}` },
          { name: 'RSVP', value: "✅ I'm coming! | ⛔ Can't make it" }
        );

      // Create RSVP buttons
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`rsvp_yes_${id}`)
          .setLabel("I'm coming!")
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`rsvp_no_${id}`)
          .setLabel("Can't make it")
          .setEmoji('⛔')
          .setStyle(ButtonStyle.Danger)
      );

      // Send via interaction response (gateway-free)
      await interaction.editReply({
        content: `${rolePing} — <@${interaction.user.id}> needs heroes! **Assemble NOW!**\n\n✅ Play now event #${id} created!`,
        embeds: [embed],
        components: [buttons]
      });
      
      // Send achievements as followUp if any
      if (achievements.length > 0) {
        const achievementText = achievements.map(a => `<@${interaction.user.id}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
        await interaction.followUp({ content: achievementText });
      }
      
    } catch (error) {
      console.error('Error creating play now event:', error);
      await interaction.editReply({
        content: '❌ Failed to create event: ' + error.message
      });
    }
  }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('playnow')
    .setDescription('Create an immediate play session - Assemble now!'),
  execute: executePlaynowCommand,
  handleCloudflare: handlePlaynowCommandCloudflare
};

