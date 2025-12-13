# TODO
https://marveling-bot.marveling.workers.dev/interactions

## Bugs, Features & Enhancements
| ITEM | DETAILS | STATUS | PRIORITY |
| ----------- | ----------- | ----------- | ----------- |
| Cron for Supabase wake | Next time it sleeps, I have to pay to wake. | PROD | **P1** |
| index.js & command.js mess | Divide all the commands into their own files and repurpose utils | DEV | **P1** |
| Unknown RSVP issue | I made like 30+ events suddenly got an error then all my data in my user got wiped out aside from my achievements. See below for logs. Also happened another time without a specific error. Happened when I removed some code in the old utils folder but that code isn't being touched by anything. Might have to investigate the tracking. | OPEN | **P1** |
| Ephemeral mechanism | Defer messages override behavior. Code too tightly coupled | OPEN | **P1** |
| Achievements not stored | Supabase communication is not established for `achievements`, `recent_host_timestamps` and other items in the table. | OPEN | **P1** |
| Achievements not happening | Looks like legendary achievements aren't happening | OPEN | **P2** |
| Lost achievement notifs | Certain achievements aren't showing their notification | OPEN | **P2** |
| Color button conflict | Red buttons' emojis are too close in color | OPEN | **P3** |
| @rivaling invites all | /guests doesn't show everyone invited in @rivaling or tag @rivaling | OPEN | **P3** |
|  |  | OPEN | **P1** |


# Checklist
- [ ] Ephemeral mechanism ⚠️
- [ ] Achievement
    - [x] Achievement granting
    - [ ] Achievement announcements
    - [x] /achievements for self
    - [x] /achievements for others
    - [x] Legendary achievements
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



### Logs:
For the sudden removal of my Hosted, Invites, and RSVP data  
```
[SUPABASE] Response: 400 {"code":"PGRST100","details":"unexpected \"r\" expecting \"not\" or operator (eq, gt, ...)","hint":null,"message":"\"failed to parse filter (rsvp)\" (line 1, column 1)"}  
✘ [ERROR] [SUPABASE] Error 400: {"code":"PGRST100","details":"unexpected \"r\" expecting \"not\" or operator (eq, gt, ...)","hint":null,"message":"\"failed to parse filter (rsvp)\" (line 1, column 1)"}  
✘ [ERROR] [SUPABASE] Query error: Error: Supabase select failed: 400 {"code":"PGRST100","details":"unexpected \"r\" expecting \"not\" or operator (eq, gt, ...)","hint":null,"message":"\"failed to parse filter (rsvp)\" (line 1, column 1)"}  
```