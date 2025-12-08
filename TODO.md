# TODO

### Cron job failing when bot asleep
I think Render knows it is a "useless" wake. Though it isn't and isn't a health/ping check, it is supposed to help fire reminders. But it isn't treated that way at all. We may have to remove this cron system and instead use it to keep Supabase awake. Then use GitHub actions to redeploy this repo every single 20min or something that isn't in the sleep time.

### Cron job to keep Supabase awake
**P1**  
Supabase goes to sleep after inactivity and I don't have anymore chances to wake it up manually I think unless I pay. So either I have to keep triggerring something in the bot on discord every other day or so OR get a cron job to keep it awake

### Lost of data [O]
**P1**  
To be more exact, everytime the bot wakes up it runs the logic, since I don't remember the events, the events in Supabase is invalid. This logic is wrong.

### Takes 30-60 sec to wake bot
**P4**  
Not much I can do at the moment, tried to make this faster but it seems to depend and change.

### Achievements reset everytime bot wakes
**P2**  
It should work fine, maybe it was because the Supabase database was turned off because it wasn't working when I tried it the past few days. Will have to fix the cron job issue first to find out because nothing is being woken up.

### /achievements broken
**P1**  
Getting this error " Error running command: targetUser.displayAvatarURL is not a function" when the user is empty and when user is filled