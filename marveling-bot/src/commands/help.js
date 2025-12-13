export function handleHelpCommand() {
    return {
      content: `**🦸 Marvel Rivals Bot**\nCoordinate game sessions (in PST), squad up with friends, and never miss a Marvel Rivals match!\n\n**Commands:**\n\`/playnow\` - Create an immediate play session\n\`/plan\` - Plan a game night at a specific date/time\n\`/list\` - View all active events with confirmed players\n\`/guests\` - View the full guest list for a specific event\n\`/invite\` - Invite users or add outside guests\n\`/reschedule\` - Reschedule a planned game night\n\`/delete\` - Cancel and delete an event\n\`/achievements\` - View your rankings and achievements\n\`/help\` - View this help message`,
      flags: 64
    };
  }