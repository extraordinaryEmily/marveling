export async function handleDeleteCommand(
    interaction,
    events,
    userId,
    env,
    supabase,
    sendFollowUp,
    applicationId,
    token,
    deleteEventFromKV // new param
  ) {
    const eventId = interaction.data.options
      ?.find(opt => opt.name === 'id')
      ?.value
      ?.replace('#', '');
  
    console.log(`[COMMAND] Delete: eventId=${eventId}`);
  
    if (!eventId) {
      return { content: '❌ Event ID is required.', flags: 64  };
    }
  
    const event = events[eventId];
    if (!event) {
      return { content: `❌ Event #${eventId} not found.`, flags: 64  };
    }
  
    if (userId !== event.creatorId) {
      return { content: `🚫 You're not allowed to delete this event!!!`, flags: 64  };
    }
  
    // Delete event from KV via injected function
    if (typeof deleteEventFromKV === 'function') {
      console.log(`[COMMAND] Deleting event #${eventId} from KV`);
      try {
        await deleteEventFromKV(env, eventId);
      } catch (error) {
        console.error(`[COMMAND] Failed to delete KV entry for #${eventId}:`, error);
        // still continue — we can still try to cancel reminders and notify
      }
    } else {
      console.warn('[COMMAND] deleteEventFromKV not provided; skipping KV delete');
    }
  
    if (supabase) {
      console.log(`[COMMAND] Canceling reminder for event #${eventId}`);
      try {
        await supabase.cancelReminder(eventId);
      } catch (error) {
        console.error('[COMMAND] Failed to cancel reminder:', error);
      }
    }
  
    const followUps = []; // populate if needed
    if (followUps.length > 0 && typeof sendFollowUp === 'function') {
      for (const followUp of followUps) {
        await sendFollowUp(applicationId, token, followUp);
      }
    }
  
    return { content: `🗑️ Event #${eventId} has been deleted.`, flags: 64 };
  }