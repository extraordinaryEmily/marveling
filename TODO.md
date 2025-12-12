# TODO
https://marveling-bot.marveling.workers.dev/interactions

## Bugs, Features & Enhancements
| ITEM | DETAILS | STATUS | PRIORITY |
| ----------- | ----------- | ----------- | ----------- |
| Cron for Supabase wake | Next time it sleeps, I have to pay to wake. | QE | **P1** |
| Ephemeral mechanism | Defer messages override behavior. Code too tightly coupled | OPEN | **P1** |
| Achievements not stored | Supabase communication is not established for `achievements` and `recent_host_timestamps`. Probably the same for some other items in the table. | OPEN | **P1** |
| Achievements not happening | Looks like legendary achievements aren't happening | OPEN | **P2** |
| Lost achievement notifs | Certain achievements aren't showing their notification | OPEN | **P2** |
| Color button conflict | Red buttons' emojis are too close in color | OPEN | **P3** |
| @rivaling invites all | /guests doesn't show everyone invited in @rivaling or tag @rivaling | OPEN | **P3** |
|  |  | OPEN | **P1** |
|  |  | OPEN | **P1** |
|  |  | OPEN | **P1** |


# Checklist
- [ ] Ephemeral mechanism ⚠️ 
- [ ] Achievement
    - [x] Achievement granting
    - [ ] Achievement announcements
    - [x] /achievements for self
    - [x] /achievements for others
    - [ ] Legendary achievements
- [ ] Delete
    - [x] Non owner deletion message
    - [x] Delete old/current events
    - [x] Deletion tracked & registered
- [ ] Guests
    - [x] RSVP is working
    - [ ] Hide old events 
    - [ ] Display all of @rivaling
- [x] Help
- [ ] Invite
    - [x] Max 5 externals
    - [x] Invite within server
    - [x] Invites tracked
    - [ ] Block old events invite
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