export async function handleInviteCommand(
    interaction,
    events,
    userId,
    username,
    env,
    supabase,
    saveEvent,
    trackInviteSent
  ) {
  
    // ===== 1. Extract inputs from interaction =====
    const eventId = interaction.data.options
      ?.find(opt => opt.name === 'id')
      ?.value
      ?.replace('#', '');
  
    const personOption = interaction.data.options?.find(opt => opt.name === 'person');
    const guestOption = interaction.data.options?.find(opt => opt.name === 'guest');
  
    // Resolved user if available
    const personId =
      personOption?.value ||
      interaction.data.resolved?.users?.[personOption?.value]?.id;
  
    const guestString = guestOption?.value;
  
    console.log(`[COMMAND] Invite: eventId=${eventId}, personId=${personId}, guestString=${guestString}`);
  
    if (!eventId) {
      return { content: '❌ Event ID is required.', flags: 64 };
    }
  
    // ===== 2. Find event =====
    const event = events[eventId];
    if (!event) {
      return { content: `❌ Event #${eventId} not found.`, flags: 64 };
    }
  
    // ===== 3. Validation =====
    if (personId && guestString) {
      return { content: `⚠️ Choose either **@person** OR **+guests**, not both.`, flags: 64 };
    }
  
    if (!personId && !guestString) {
      return { content: `⚠️ Please tag a person or add guests (+1, +2).`, flags: 64 };
    }
  
    // ===== 4A. Handle inviting a Discord user =====
    if (personId) {
      if (personId === userId) {
        return { content: `⚠️ You can't invite yourself!`, flags: 64 };
      }
  
      if (!event.invited) event.invited = [];
  
      if (!event.invited.includes(personId)) {
        event.invited.push(personId);
      }
  
      // Save event
      console.log(`[COMMAND] Saving updated event after invite`);
      await saveEvent(env, eventId, event);
  
      // Track achievement
      console.log(`[COMMAND] Tracking invite achievement for ${userId}`);
      await trackInviteSent(supabase, userId);
  
      return {
        content: `📩 Invited <@${personId}> to event #${eventId}!`,
        flags: 0
      };
    }
  
    // ===== 4B. Handle +guest count format =====
    if (!/^\+\d+$/.test(guestString.trim())) {
      return { content: `⚠️ Invalid format. Use +1, +2, etc.`, flags: 64 };
    }
  
    const guestCount = parseInt(guestString.replace('+', ''), 10);
  
    // How many this user already added
    const currentTotal = (event.guests || [])
      .filter(g => g.userId === userId)
      .reduce((t, g) => t + g.count, 0);
  
    const newTotal = currentTotal + guestCount;
  
    if (newTotal > 5) {
      const remaining = 5 - currentTotal;
      return {
        content: remaining <= 0
          ? `⚠️ You've already invited the maximum of **5 guests** for this event.`
          : `⚠️ You can only invite **${remaining} more guest(s)** for this event (currently ${currentTotal}/5).`,
        flags: 64
      };
    }
  
    if (!event.guests) event.guests = [];
  
    event.guests.push({ userId, username, count: guestCount });
  
    // Save event
    console.log(`[COMMAND] Saving updated event after guest invite`);
    await saveEvent(env, eventId, event);
  
    return {
      content: `🌐 ${username} invited **${guestString}** guest(s) to event #${eventId} (${newTotal}/5 total).`,
      flags: 0
    };
  }