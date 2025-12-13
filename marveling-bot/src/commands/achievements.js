export async function handleAchievementsCommand(interaction, supabase) {
    // ===== 1. Resolve Target User =====
    const userOption = interaction.data.options?.find(opt => opt.name === 'user');
    const invokingUserId = interaction.member?.user?.id || interaction.user?.id;
  
    const targetUserId = userOption?.value || invokingUserId;
  
    const targetUser =
      interaction.data.resolved?.users?.[targetUserId] ||
      interaction.member?.user ||
      interaction.user;
  
    const targetUsername = targetUser.username || targetUser.global_name;
    const targetAvatar = targetUser.avatar;
  
    //console.log(`[COMMAND] Fetching achievements for user ${targetUserId}`);
  
    // ===== 2. Default Values =====
    let stats = { hostsCreated: 0, invitesSent: 0, rsvpsMade: 0 };
    let ranks = { host: {}, recruiter: {}, responder: {} };
    let legendaryAchievements = [];
  
    // ===== 3. Fetch From Supabase =====
    try {
      const userStats = await supabase.getUserStatsFromSupabase(targetUserId);
      //console.log(`[COMMAND] Fetched stats from Supabase:`, userStats);
  
      stats = {
        hostsCreated: userStats.hosts_created || 0,
        invitesSent: userStats.invites_sent || 0,
        rsvpsMade: userStats.rsvps_made || 0
      };
  
      // ===== 4. Calculate Ranks =====
      const { ACHIEVEMENT_TIERS, LEGENDARY_ACHIEVEMENTS } = await import('../achievementManager.js');
  
      const getHighestRank = (tiers, count) => {
        let currentRank = null;
        let nextRank = tiers[0];
  
        for (let i = 0; i < tiers.length; i++) {
          if (count >= tiers[i].count) {
            currentRank = tiers[i];
            nextRank = tiers[i + 1] || null;
          } else break;
        }
  
        return { current: currentRank, next: nextRank, progress: count };
      };
  
      ranks = {
        host: getHighestRank(ACHIEVEMENT_TIERS.HOST, stats.hostsCreated),
        recruiter: getHighestRank(ACHIEVEMENT_TIERS.RECRUITER, stats.invitesSent),
        responder: getHighestRank(ACHIEVEMENT_TIERS.RESPONDER, stats.rsvpsMade)
      };
  
      //console.log(`[COMMAND] Calculated ranks:`, ranks);
  
      legendaryAchievements = Object.values(LEGENDARY_ACHIEVEMENTS).filter(
        a => Array.isArray(userStats.achievements) && userStats.achievements.includes(a.id)
      );
  
      //console.log(`[COMMAND] Legendary achievements:`, legendaryAchievements);
  
    } catch (error) {
      console.error('[COMMAND] Error fetching achievements from Supabase:', error);
    }
  
    // ===== 5. Build Embed =====
    const avatarURL = targetAvatar
      ? `https://cdn.discordapp.com/avatars/${targetUserId}/${targetAvatar}.${targetAvatar.startsWith('a_') ? 'gif' : 'png'}?size=256`
      : `https://cdn.discordapp.com/embed/avatars/${(parseInt(targetUserId) >> 22) % 6}.png`;
  
    function createProgressBar(current, target) {
      const percentage = Math.min(current / target, 1);
      const barLength = 10;
      const filledLength = Math.round(percentage * barLength);
      return `${'█'.repeat(filledLength)}${'░'.repeat(barLength - filledLength)} ${Math.round(percentage * 100)}%`;
    }
  
    function toTitleCase(str) {
      return str.toLowerCase().split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  
    const embed = {
      color: 0xff0000,
      title: `🏆 ${targetUsername || 'Unknown User'}'s Achievements`,
      thumbnail: { url: avatarURL },
      description: '**Marvel Rivals Ranking System**',
      timestamp: new Date().toISOString(),
      fields: []
    };
  
    // ===== Host Rank =====
    const hostRank = ranks.host;
    let hostText = hostRank.current
      ? `${hostRank.current.emoji} ${hostRank.current.name}${
          hostRank.next ? `\n${createProgressBar(hostRank.progress, hostRank.next.count)}` : ' ✨'
        }`
      : 'Not yet ranked';
  
    embed.fields.push({ name: '🎮 **HOST RANK**', value: hostText });
  
    // ===== Recruiter Rank =====
    const recruiterRank = ranks.recruiter;
    let recruiterText = recruiterRank.current
      ? `${recruiterRank.current.emoji} ${recruiterRank.current.name}${
          recruiterRank.next ? `\n${createProgressBar(recruiterRank.progress, recruiterRank.next.count)}` : ' ✨'
        }`
      : 'Not yet ranked';
  
    embed.fields.push({ name: '👋 **RECRUITER RANK**', value: recruiterText });
  
    // ===== Responder Rank =====
    const responderRank = ranks.responder;
    let responderText = responderRank.current
      ? `${responderRank.current.emoji} ${responderRank.current.name}${
          responderRank.next ? `\n${createProgressBar(responderRank.progress, responderRank.next.count)}` : ' ✨'
        }`
      : 'Not yet ranked';
  
    responderText += `\n━━━━━━━━━━━━━━━━`;
  
    embed.fields.push({ name: '💬 **RESPONDER RANK**', value: responderText });
  
    // ===== Stats =====
    const statsValue = `${stats.hostsCreated} Hosted • ${stats.invitesSent} Invited • ${stats.rsvpsMade} RSVPs`;
  
    embed.fields.push({
      name: '📊 **STATS**',
      value: legendaryAchievements.length > 0 ? `${statsValue}\n━━━━━━━━━━━━━━━━` : statsValue
    });
  
    // ===== Legendary =====
    if (legendaryAchievements.length > 0) {
      embed.fields.push({
        name: '✨ **LEGENDARY**',
        value: legendaryAchievements.map(a => `${a.emoji} ${toTitleCase(a.name)}`).join(' • ')
      });
    }
  
    // ===== 6. Return Final Result for Discord =====
    return {
      embeds: [embed],
      flags: 64
    };
  }