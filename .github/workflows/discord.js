// discordClient.js
const { Client, GatewayIntentBits, Events } = require('discord.js');
const mysql = require("mysql2/promise")
// dotenv direkt richtig konfigurieren und laden
require("dotenv").config(); 

const database = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "",
    database: "discord"
}) 
if(database) console.log(`erfolgreich mit database ${database.config}`)

async function createDiscordClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent ,
      GatewayIntentBits.GuildVoiceStates
    ]
  });

  // 1. ZUERST alle Event-Listener registrieren (gute Praxis)
  client.on(Events.MessageCreate, (message) => {
    if (message.author.bot) return;
    if (message.content === '!ping') {
      message.reply('Pong!');
    }
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    console.log("event")
    var [supremecord_open] = await database.query(`SELECT * from booleans WHERE name = 'SUPREMECOURT_OPEN'`)
    console.log(supremecord_open[0])
    if (newState.channelId == process.env.SUPREMECORD_VOICE && supremecord_open[0].bool == 0) {
        console.log(`user joint supreme court`)
        newState.member.voice.disconnect()
      }
  })

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    // 1. WICHTIG bei Reaktionen auf alte Nachrichten:
    // Falls die Nachricht nicht mehr im RAM-Cache des Bots ist, müssen wir sie nachladen.
    if (reaction.partial) {
        try {
            await reaction.fetch()
        } catch (error) {a
            console.error('Fehler beim Laden der Nachricht:', error)
            return;
        }
    }

    // 2. Bots ignorieren (damit der Bot nicht auf seine eigenen Reaktionen antwortet)
    if (user.bot) return;

    // 3. Auf die Reaktion zugreifen
    
    //console.log(`Der Inhalt der Nachricht war: "${reaction.message.content}"`);

    // 4. Beispiel: Eine Aktion basierend auf einem Emoji ausführen
    if (reaction.message.id == process.env.MESSAGE_ID_RULES) {
      console.log(`${user.tag} wurde die Rolle ${reaction.emoji.name} hinzugefügt!`);
      const guild = reaction.message.guild
      try{
        const member = await guild.members.fetch(user.id)
        member.roles.add(process.env.CIVILIAN_ROLE)
      } catch(error) {
        console.log('{member}')
      }
    }
});

client.on(Events.MessageReactionRemove, async (reaction, user)=>{
  if (reaction.partial) {
        try {
            await reaction.fetch()
        } catch (error) {
            console.error('Fehler beim Laden der Nachricht:', error)
            return;
        }
    }

    // 2. Bots ignorieren (damit der Bot nicht auf seine eigenen Reaktionen antwortet)
    if (user.bot) return;

    // 3. Auf die Reaktion zugreifen

   if (reaction.message.id == process.env.MESSAGE_ID_RULES) {
      console.log(`${user.tag} wurde die Rolle ${reaction.emoji.name} entzogen!`);
      const guild = reaction.message.guild
      try{
        const member = await guild.members.fetch(user.id)
        member.roles.remove(process.env.CIVILIAN_ROLE)
        member.voice.disconnect()
      } catch(error) {
        console.log('{member}')
      }
    }
})

  // Funktion zum Loggen der User (ausgelagert für Übersichtlichkeit)
  function logUsers(users) {
    for (const [userId, member] of users) {
      console.log(`Mitglied gefunden: ${member.user.tag}`);
    }
  }

  async function checkRoles(users, rulesMessage) {
    const TARGET_EMOJI = '✅'
    const reactions = rulesMessage.reactions.cache.get(TARGET_EMOJI);
    const reactedUsers = reactions ? await reactions.users.fetch() : new Map
    console.log(`[Rollen-Abgleich] Gefundene Reaktionen für ${TARGET_EMOJI}: ${reactedUsers.size}`);

    let rollenHinzugefuegt = 0;
    let rollenEntzogen = 0;

    for(const[userId, user] of users) {
      // Bots (inklusive sich selbst) ignorieren
      if (user.user.bot) continue

      // Prüfen, ob das Mitglied mit dem Emoji reagiert hat
      const hatReagiert = reactedUsers.has(userId)
      const hatRolle = user.roles.cache.has(process.env.CIVILIAN_ROLE)

      if (hatReagiert && !hatRolle && userId != process.env.MY_DISCORD_USER_TOKEN) {
        await user.roles.add(process.env.CIVILIAN_ROLE)
        console.log(`+ Rolle an ${user.user.tag} vergeben.`);
        rollenHinzugefuegt++
      }
      else if (!hatReagiert && hatRolle && userId != process.env.MY_DISCORD_USER_TOKEN) {
        await user.roles.remove(process.env.CIVILIAN_ROLE);
        console.log(`- Rolle von ${user.user.tag} entfernt.`);
        rollenEntzogen++;
      }
    }
  }

  // 2. JETZT den Bot einloggen
  client.login(process.env.BOT_TOKEN);
  
  // 3. Auf das Bereit-Event warten und Daten fetchen
  try {
    const { users, rulesMessage } = await new Promise((resolve, reject) => {
      client.once(Events.ClientReady, async (readyClient) => {
        try {
          const my_guild = readyClient.guilds.cache.get(process.env.GUILD_ID);
          if (!my_guild) return reject(new Error('Server (Guild) nicht gefunden!'));

          // WICHTIG: Hier fehlte das 'await'!
          const my_users = await my_guild.members.fetch(); 
          
          const my_rules_channel = my_guild.channels.cache.get(process.env.CHANNEL_ID_RULES);
          if (!my_rules_channel || !my_rules_channel.isTextBased()) {
             return reject(new Error('Regel-Kanal nicht gefunden oder nicht textbasiert!'));
          }

          const my_rulesMessage = await my_rules_channel.messages.fetch(process.env.MESSAGE_ID_RULES);

          resolve({
            users: my_users,
            rulesMessage: my_rulesMessage,
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    // Hier hast du nun erfolgreich Zugriff auf deine Daten beim Start
    console.log(`Bot erfolgreich gestartet! ${users.size} Mitglieder geladen.`);
    
    // Testweise deine Funktion aufrufen
    logUsers(users);
    checkRoles(users, rulesMessage)

  } catch (error) {
    console.error("Fehler beim Initialisieren des Bots:", error);
  }


  // 4. Den Client für die restliche App zurückgeben
  return client;
}

module.exports = { createDiscordClient };
