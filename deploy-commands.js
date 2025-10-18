// deploy-commands.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');

const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Replace with your own IDs
const CLIENT_ID = '1424457717656977410';
const GUILD_ID = '902775580787879997'; // optional (for faster testing)

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), // for testing
      // or Routes.applicationCommands(CLIENT_ID) for global deploy
      { body: commands },
    );

    console.log('✅ Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
// Note: For global commands, it may take up to an hour to update.