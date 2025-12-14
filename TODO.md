# TODO
https://marveling-bot.marveling.workers.dev/interactions

## Bugs, Features & Enhancements
| ITEM | DETAILS | STATUS | PRIORITY |
| ----------- | ----------- | ----------- | ----------- |
| Ephemeral mechanism | Defer messages override behavior. Code too tightly coupled | OPEN | **P1** |
| Old events alive | Past events still exist and should be automatically deleted instead of hidden so that /invite and /guests can't touch them | OPEN | **P1** |
| Table broken | Certain items on Supabase table don't get tracked. | OPEN | **P1** |
| Lost achievement notifs | Certain achievements aren't showing their notification | OPEN | **P1** |
| Achievements testing | Looks like some legendary achievements aren't working so testing is required. | OPEN | **P2** |
| @rivaling invites all | /guests doesn't show everyone invited in @rivaling or tag @rivaling | OPEN | **P3** |



# Checklist
- [ ] Ephemeral mechanism ⚠️
- [ ] Clean up orphaned reminders
- [ ] Clean up old events ⚠️
- [ ] Check if reminders sent
- [ ] Mark reminders sent
- [ ] Achievement
    - [x] Achievement granting
    - [ ] Achievement announcements ⚠️
    - [x] /achievements for self
    - [x] /achievements for others
    - [x] Legendary achievements
    - [ ] Process Event Nonresponders
- [ ] Delete
    - [x] Non owner deletion message
    - [x] Delete old/current events
    - [x] Deletion tracked & registered
    - [ ] Delete Supabase reminder
- [ ] Guests
    - [x] RSVP is working
    - [ ] Hide old events
    - [ ] Display all of @rivaling
- [x] Help
- [ ] Invite
    - [x] Max 5 externals
    - [x] Invite within server
    - [x] Invites tracked
- [ ] List
    - [x] Hide expired Play Now events
    - [ ] Hide expired Plan events
    - [x] Show active stored events
    - [x] Show RSVP
- [ ] Create
    - [ ] Play Now
    - [ ] Plan
    - [ ] Functionality
        - [ ] Working reminders ⚠️
        - [ ] Store reminders ⚠️
        - [x] Store events
        - [x] Hosting tracked
- [ ] Reschedule **IGNORING THIS FOR NOW**