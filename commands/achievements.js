const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUserStats, getUserRanks, getLegendaryAchievements, ACHIEVEMENT_TIERS } = require('../utils/achievementManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('View your Marvel Rivals achievements and rankings')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('View another user\'s achievements (optional)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const userOption = interaction.options.getUser('user');
    let targetUser = interaction.user;
    
    if (userOption) {
      // getUser() returns resolved user data (plain object with username/avatar) or { id: ... }
      // If it already has username/avatar, use it directly (no need to fetch)
      // Otherwise, try to fetch from client if available
      if (userOption.username || userOption.avatar) {
        // Already has complete user data from Discord's resolved data
        targetUser = userOption;
      } else if (interaction.client && userOption.id) {
        // Only has ID, try to fetch full User object
        try {
          targetUser = await interaction.client.users.fetch(userOption.id);
        } catch (error) {
          // Fetch failed, use what we have
          targetUser = userOption;
        }
      } else {
        // No client available, use what we have
        targetUser = userOption;
      }
    }
    
    const stats = await getUserStats(targetUser.id);
    const ranks = await getUserRanks(targetUser.id);

    // Create the main embed
    // Handle displayAvatarURL - use method if available, otherwise construct URL
    const avatarURL = typeof targetUser.displayAvatarURL === 'function' 
      ? targetUser.displayAvatarURL()
      : targetUser.avatar 
        ? `https://cdn.discordapp.com/avatars/${targetUser.id}/${targetUser.avatar}.${targetUser.avatar?.startsWith('a_') ? 'gif' : 'png'}?size=256`
        : `https://cdn.discordapp.com/embed/avatars/${(parseInt(targetUser.id) >> 22) % 6}.png`;
    
    const username = targetUser.username || targetUser.global_name || 'Unknown User';
    
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle(`🏆 ${username}'s Achievements`)
      .setThumbnail(avatarURL)
      .setDescription('**Marvel Rivals Ranking System**')
      .setTimestamp();

    // Host Rank Field
    const hostRank = ranks.host;
    let hostText = '';
    if (hostRank.current) {
      hostText = `${hostRank.current.emoji} ${hostRank.current.name}`;
      if (hostRank.next) {
        const progressBar = createProgressBar(hostRank.progress, hostRank.next.count);
        hostText += `\n${progressBar}`;
      } else {
        hostText += ` ✨`;
      }
    } else {
      hostText = `Not yet ranked`;
    }
    embed.addFields({ name: '🎮 **HOST RANK**', value: hostText, inline: false });

    // Recruiter Rank Field
    const recruiterRank = ranks.recruiter;
    let recruiterText = '';
    if (recruiterRank.current) {
      recruiterText = `${recruiterRank.current.emoji} ${recruiterRank.current.name}`;
      if (recruiterRank.next) {
        const progressBar = createProgressBar(recruiterRank.progress, recruiterRank.next.count);
        recruiterText += `\n${progressBar}`;
      } else {
        recruiterText += ` ✨`;
      }
    } else {
      recruiterText = `Not yet ranked`;
    }
    embed.addFields({ name: '👋 **RECRUITER RANK**', value: recruiterText, inline: false });

    // Responder Rank Field
    const responderRank = ranks.responder;
    let responderText = '';
    if (responderRank.current) {
      responderText = `${responderRank.current.emoji} ${responderRank.current.name}`;
      if (responderRank.next) {
        const progressBar = createProgressBar(responderRank.progress, responderRank.next.count);
        responderText += `\n${progressBar}`;
      } else {
        responderText += ` ✨`;
      }
    } else {
      responderText = `Not yet ranked`;
    }
    responderText += `\n━━━━━━━━━━━━━━━━`;
    embed.addFields({ name: '💬 **RESPONDER RANK**', value: responderText, inline: false });

    // Stats summary
    const statsValue = `${stats.hostsCreated} Hosted • ${stats.invitesSent} Invited • ${stats.rsvpsMade} RSVPs`;
    
    // Legendary achievements
    const legendaryAchievements = await getLegendaryAchievements(targetUser.id);
    
    // Add divider to stats if legendary exists
    embed.addFields({
      name: '📊 **STATS**',
      value: legendaryAchievements.length > 0 ? `${statsValue}\n━━━━━━━━━━━━━━━━` : statsValue,
      inline: false
    });
    
    if (legendaryAchievements.length > 0) {
      const legendaryText = legendaryAchievements
        .map(a => `${a.emoji} ${toTitleCase(a.name)}`)
        .join(' • ');
      embed.addFields({
        name: '✨ **LEGENDARY**',
        value: legendaryText,
        inline: false
      });
    }

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  }
};

// Helper function to create a progress bar
function createProgressBar(current, target) {
  const percentage = Math.min(current / target, 1);
  const barLength = 10;
  const filledLength = Math.round(percentage * barLength);
  const emptyLength = barLength - filledLength;
  
  const filledBar = '█'.repeat(filledLength);
  const emptyBar = '░'.repeat(emptyLength);
  
  return `${filledBar}${emptyBar} ${Math.round(percentage * 100)}%`;
}

// Helper function to convert ALL CAPS to Title Case
function toTitleCase(str) {
  return str.toLowerCase().split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

