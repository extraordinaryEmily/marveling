# TODO
### Cron job output too large [O]
**P1**  
Cron job failing because the output is too large. I would assume that means the startup output is just too much so let's lower the amount of console logs for now and test each item once more again later.

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