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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('playnow')
    .setDescription('Create an immediate play session - Assemble now!'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      // Fetch guild and channel using API (no cache)
      const guild = await interaction.client.guilds.fetch(interaction.guild.id);
      const channel = await interaction.client.channels.fetch(interaction.channel.id);
      
      // Fetch roles to find 'rivaling' role
      const roles = await guild.roles.fetch();
      const role = roles.find(r => r.name === 'rivaling');
      const rolePing = role ? `<@&${role.id}>` : '@rivaling';

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
      
      if (achievements.length > 0) {
        const achievementText = achievements.map(a => `<@${interaction.user.id}> unlocked ${a.emoji} **${a.name}**!`).join('\n');
        await channel.send(achievementText);
      }
      
      // Add host as invited
      addInvited(id, interaction.user.id);
      
      // Fetch members with the role and add them as invited
      if (role) {
        await guild.members.fetch();
        const members = await guild.members.fetch();
        members.forEach(member => {
          if (member.roles.cache.has(role.id)) {
            addInvited(id, member.id);
          }
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x00aeff)
        .setTitle('⚡ Avengers assemble!')
        .setImage('https://i.imgur.com/pMPmPef.gif')
        .addFields(
          { name: 'Event ID', value: `#${id}` },
          { name: 'RSVP', value: "✅ I'm coming! | ❌ Can't make it" }
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
          .setEmoji('❌')
          .setStyle(ButtonStyle.Danger)
      );

      await channel.send({
        content: `${rolePing} — <@${interaction.user.id}> needs heroes! **Assemble NOW!**`,
        embeds: [embed],
        components: [buttons],
        allowedMentions: { parse: ['roles'] }
      });
      
      await interaction.editReply({ 
        content: '✅ Play now event created! Check the channel.', 
      });
      
    } catch (error) {
      console.error('Error creating play now event:', error);
      await interaction.editReply({
        content: '❌ Failed to create event: ' + error.message
      });
    }
  }
};

