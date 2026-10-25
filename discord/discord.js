// discordClient.js
const fs = require('fs')
const path = require('path')
//User isnt even required, we dont know who User is
const { Client, Collection, GatewayIntentBits, Events, REST, Routes, User } = require('discord.js');
require("dotenv").config(); 

const database = require('./database');
const { data } = require('./commands/createtopic');
const { emojify } = require('node-emoji');
const { unemojify } = require('node-emoji');
const { count } = require('console');



async function createDiscordClient() {


  const commands = []
  const channels = []
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const commandsPath = path.join(__dirname, 'commands')
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'))

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
  client.commands = new Collection()


 
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    // WICHTIG: Nur den 'data'-Teil nehmen und .toJSON() aufrufen!
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        client.commands.set(command.data.name, command)
    } else {
        console.log(`[WARNUNG] Der Command bei ${filePath} benötigt "data" und "execute".`);
    }
  }

  const rest = new REST().setToken(process.env.BOT_TOKEN)
    try {
      console.log(`Starte das Aktualisieren von ${commands.length} Slash Commands.`)
      const data = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands },
      );
      if (data) console.log(`Das registrieren der Commands war erfolgreich`)
    } catch (err) {
      console.log(`Aktualiseiren der SlashCommands fehlgeschlagen`);
      console.log(err)
    }

  // 1. ZUERST alle Event-Listener registrieren (gute Praxis)
  client.on(Events.MessageCreate, (message) => {
    if (message.author.bot) return;
    if (message.content === '!ping') {
      message.reply(`You triggered the server`);
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
    const {unemojify, emojify} = await import('node-emoji')
    const guild = reaction.message.guild
    if (reaction.partial) {
        try {
            await reaction.fetch()
        } catch (error) {a
            console.error('Fehler beim Laden der Nachricht:', error)
            return;
        }
    }
    if (user.bot) return;
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
    const [demandingMessage] = await database.query(`SELECT * FROM topic_message`)
    const [topics] = await database.query(`SELECT * FROM topics`)
    if (demandingMessage.length === 1) {
      const channel = client.channels.cache.get(process.env.TOPIC_CHANNEL)
      if (channel) {
        console.log(`channel existierrt`)
        console.log(demandingMessage[0].channel_id)
        const message = await channel.messages.fetch(`${demandingMessage[0].channel_id}`)
        if (reaction.message.id == message.id){
          const unicode_emoji = unemojify(reaction.emoji.name)
          topics.forEach(async (topic)=>{
            if (unicode_emoji == topic.topic_emoji) {
              const role = guild.roles.cache.find(role => role.name == topic.topic_name)
              const member = await guild.members.fetch(user.id)
              console.log(member)
              await member.roles.add(role)

              console.log(`role ${role.name} added to ${member.user.username}`)
            }
          })
        }
      }
      
    }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;
    
    await command.execute(interaction);
  } catch (error) {
    console.error("🔴 Fehler im interactionCreate-Handler:", error);
    
    // Verhindert den Absturz, falls der Command bereits deferReply() genutzt hat
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: 'Es gab einen Fehler beim Ausführen dieses Befehls!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Es gab einen Fehler beim Ausführen!', ephemeral: true });
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
    const guild = reaction.message.guild
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
    const [demandingMessage] = await database.query(`SELECT * FROM topic_message`)
    const [topics] = await database.query(`SELECT * FROM topics`)
    if (demandingMessage.length === 1) {
      const channel = client.channels.cache.get(process.env.TOPIC_CHANNEL)
      if (channel) {
        console.log(`channel existierrt`)
        console.log(demandingMessage[0].channel_id)
        const message = await channel.messages.fetch(`${demandingMessage[0].channel_id}`)
        if (reaction.message.id == message.id){
          const unicode_emoji = unemojify(reaction.emoji.name)
          topics.forEach(async (topic)=>{
            if (unicode_emoji == topic.topic_emoji) {
              const role = guild.roles.cache.find(role => role.name == topic.topic_name)
              const member = await guild.members.fetch(user.id)
              console.log(member)
              await member.roles.remove(role)

              console.log(`role ${role.name} added to ${member.user.username}`)
            }
          })
        }
      }
      
    }
})
//der client login nach dem registrieren der Events
client.login(process.env.BOT_TOKEN);



  async function logUsers(formattedUsers) {
    for (const {id, username, globalName, displayName, bot, avatarUrl} of formattedUsers) {
      var [user] = await database.query(`SELECT * FROM user WHERE id = "` + id + `"`)
        if (user.length == 0) {
          const result = await database.query(`INSERT INTO user (id, username, globalname, displayname, bot, avatarUrl) VALUES ("` + id + `", "` 
            + username 
            + `", "`
            + globalName
            + `", "`
            + displayName
            + `", `
            + bot
            + `, "`
            + avatarUrl
            + `")`)

          if(result) {
            console.log(`Datensatz angelegt ${result}`)
          } else {
            console.log(`Datensatz anlegen fehlgeschlagen`)
          }
          
        }
        
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
  async function cleanTopicThread (counter = 0) {
    counter++
    console.log(`cleanTopicThread`)
    const {unemojify, emojify} = await import('node-emoji')
    const [topic_message] = await database.query(`SELECT * FROM topic_message`)
    const [topics] = await database.query(`SELECT * FROM topics`)
    
    if (!topic_message) console.log(`entry database message not found`)
    const channel = client.channels.cache.get(process.env.TOPIC_CHANNEL)
    let sentMessage;

    if (channel) {
      let messageContent = `**current topics to subscribe:**\n\n`;
      const emojisToReact = []; 
      
      for (var i = 0; i < topics.length; i++) {
        const currentTopic = topics[i];
        messageContent += `*${currentTopic.topic_name}*  ${emojify(currentTopic.topic_emoji)}\n`;
        if (currentTopic.topic_emoji) {
          emojisToReact.push(emojify(currentTopic.topic_emoji));
        }
      }

      if (topic_message.length == 0) {
        try {
          // 1. Nachricht senden und anpinnen
          sentMessage = await channel.send(messageContent);
          console.log(`Neue Nachricht erstellt. ID: ${sentMessage.id}`);
          await sentMessage.pin(); // await hinzugefügt für Stabilität
          
          // 2. Nacheinander auf die Nachricht reagieren
          for (const emoji of emojisToReact) {
            await sentMessage.react(emoji);
          }
          
          // HINWEIS: Hier tragen wir die sentMessage.id in deine Spalte ein
          const updateTopicMessage = await database.query(
            `INSERT INTO topic_message (channel_id) VALUES (?)`,
            [sentMessage.id]
          )
          
          if (updateTopicMessage) {
            console.log(`database topic_message updatet`)
          } else {
            console.log(`database topic_message failed`)
          }
        } catch (err) {
          console.error(`Fehler beim Senden der Nachricht oder beim Reagieren:`, err);
        }
      } else {
        try {
          // 1. Holt die Nachricht anhand der in 'channel_id' gespeicherten Nachrichten-ID
          console.log(topic_message[0].channel_id)
          sentMessage = await channel.messages.fetch(`${topic_message[0].channel_id}`)
          // 2. KORREKTUR: Übergib 'messageContent' und nutze 'await'
          await sentMessage.edit(messageContent)
          for (const emoji of emojisToReact) {
            await sentMessage.react(emoji);
          }
          await sentMessage.pin()
          console.log(`message gefunden und erfolgreich aktualisiert`)
        } catch (err) {
          console.error(`Fehler beim Editieren der Nachricht:`, err);
        }
      }
      try {
        // 1. Die letzten 100 Nachrichten aus dem Kanal abrufen
        const messages = await channel.messages.fetch({ limit: 100 });

        // 2. Filtern: Behalte nur Nachrichten, die NICHT vom Bot selbst sind
        const messagesToDelete = messages.filter(msg => msg.author.id !== client.user.id);

        if (messagesToDelete.size === 0) {
            console.log("Keine fremden Nachrichten zum Löschen gefunden.");
            return;
        }

        // 3. Alle gefilterten Nachrichten auf einmal löschen
        await channel.bulkDelete(messagesToDelete);
        console.log(`${messagesToDelete.size} fremde Nachricht(en) erfolgreich gelöscht.`);

    } catch (error) {
        console.error("Fehler beim Bereinigen des Kanals:", error);
    }    
    console.log(`clean topic thread druchlauf ${counter}`)
    await sleep(300000)
    await cleanTopicThread(counter)
    }
      
  }

  ////NÄCHSTER SCHRITT KANAL ERSTELLEN
  async function checkPublishedTopics(counter = 0) {
    counter++
    const {unemojify, emojify} = await import('node-emoji')

    console.log(`checking for published topics, worker rekursiver Durchlauf ${counter} `)
       
    const guild = client.guilds.cache.get(process.env.GUILD_ID)
    const channels = await guild.channels.fetch()
    
    const [topics] = await database.query(`SELECT * FROM topics WHERE bool_publishied = 1`)
    
    for (var i = 0; i < topics.length; i++) {
      const [owner] = await database.query(`SELECT * FROM user WHERE ai_user = "` + topics[i].owner +`"`)
      let role = await guild.roles.cache.find(role => role.name === topics[i].topic_name)
      const user = guild.members.cache.get(owner[0].id)
      let hasRole;
      const emoji = emojify(topics[i].topic_emoji)
      const formattedTopicName = emoji + topics[i].topic_name.toLowerCase().replace(/\s+/g, '-');
      if (!role) {  
        const botHighestRole = guild.members.me.roles.highest
        role = await guild.roles.create({
          name: topics[i].topic_name,
          color: topics[i].topic_color,
          reson: `new role created for ${topics[i].topic_name}`
        })
        await role.setPosition(botHighestRole.position - 1)
        console.log(`new role created with the name ${role.name}`)
        hasRole = user.roles.cache.has(role)
        if(!hasRole && user) {
          await user.roles.add(role)
        }
      } else {
        //const user = guild.members.cache.get(owner[0].id)
        hasRole = user.roles.cache.has(role.id)
        if (!hasRole && user) {
            await user.roles.add(role)
            console.log(`the owner of the topic had no role, role ${role.name} has been added`)
        }
      }

      let channel = channels.find(channel => channel.name === formattedTopicName && channel.type === 0)
      if(!channel) {
        
        channel = await guild.channels.create({
          name: `${emoji}${topics[i].topic_name}`,
          type: 0, //0 = textchannel
          parent: process.env.TOPIC_CATEGORY,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: ['ViewChannel', 'SendMessages']
            },
            {
              id: role,
              allow: ['ViewChannel', 'SendMessages']
            }
          ]
        })
      } else {
        await channel.permissionOverwrites.set(
          [{
            id: guild.id,
            deny: ['ViewChannel', 'SendMessages']
        },
        {
          id: role, 
          allow: ['ViewChannel', 'SendMessages']
        }]
      )
      }
      if (topics[i].topic_channel != channel.id || topics[i].topic_role != role.id) {
        const result = await database.query(`UPDATE topics SET topic_channel =?, topic_role=? WHERE ai_topics = ?`,
        [channel.id, role.id, topics[i].ai_topics]
      )
        if (result) {
          console.log(`Database updatet ${result}`)
        }
      }      
      
      
    }
    //const role = await guild.roles.cache.find(role => role.name === topic)
    //console.log(topic) 
    await sleep(300000)
    await checkPublishedTopics(counter)
  }

  async function assingTopicRoles(counter = 0) {
    counter++;
    
    const [topic_message] = await database.query(`SELECT * FROM topic_message`);
    const [topics] = await database.query(`SELECT * FROM topics`);
    const { unemojify } = await import('node-emoji');

    if (!topic_message || topic_message.length === 0) {
        console.log(`entry database message not found`);
        return;
    }

    const channel = client.channels.cache.get(process.env.TOPIC_CHANNEL);
    if (channel) {
        try {
            const message = await channel.messages.fetch(`${topic_message[0].channel_id}`);
            if (message) {
                
                // 1. Reaktionen der Nachricht holen
                const reactions = message.reactions.cache;

                // 2. Jedes Thema aus der DB durchgehen
                for (const topic of topics) {
                    const role = message.guild.roles.cache.find(r => r.name === `${topic.topic_name}`);
                    if (!role) continue;

                    // Set für User-IDs, die für dieses Thema gestimmt haben
                    const berechtigteUserIds = new Set();

                    // Alle Emojis prüfen, die zu diesem Thema gehören
                    for (const reaction of reactions.values()) {
                        const emoji = unemojify(reaction.emoji.name);

                        if (emoji === topic.topic_emoji) {
                            // WICHTIG: users.fetch() ist okay, da es HTTP nutzt und nicht das Gateway blockiert!
                            const users = await reaction.users.fetch();
                            for (const user of users.values()) {
                                if (user.bot) continue;
                                berechtigteUserIds.add(user.id);
                            }
                        }
                    }

                    // --- TEIL 1: ROLLEN HINZUFÜGEN ---
                    for (const userId of berechtigteUserIds) {
                        try {
                            // Wir holen das Mitglied primär aus dem CACHE (.cache.get) statt per .fetch()
                            let member = message.guild.members.cache.get(userId);
                            if (!member) member = await message.guild.members.fetch(userId); // Fallback falls offline

                            if (member && !member.roles.cache.has(role.id)) {
                                await member.roles.add(role);
                                console.log(`[Hinzugefügt] Rolle ${role.name} zu ${member.user.username}`);
                                await sleep(100); // 100ms Pause, um HTTP-Rate-Limits zu schonen
                            }
                        } catch (err) {
                            console.error(`Fehler beim Hinzufügen der Rolle für User ${userId}:`, err);
                        }
                    }

                    // --- TEIL 2: GEGENSTÜCK (ROLLEN ENTFERNEN) ---
                    // REPARATUR: Kein .fetch() mehr! Wir nutzen rein den Cache des Bots.
                    // Da der Server klein ist, sind die Rolleninhaber hier bereits gelistet.
                    const mitgliederMitRolle = role.members; 

                    for (const member of mitgliederMitRolle.values()) {
                        if (member.user.bot) continue;

                        // Wenn die ID nicht im Reaktions-Set ist -> Rolle weg
                        if (!berechtigteUserIds.has(member.id)) {
                            try {
                                await member.roles.remove(role);
                                console.log(`[Entfernt] Rolle ${role.name} von ${member.user.username} (Keine Reaktion)`);
                                await sleep(100); // 100ms Pause
                            } catch (err) {
                                console.error(`Fehler beim Entfernen der Rolle von ${member.user.username}:`, err);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Fehler beim Verarbeiten der Topic-Nachricht oder Rollen:", error);
        }
    }

    console.log(`assingTopicRoles rekurisv durchlauf ${counter}`);
}

  
  // 3. Auf das Bereit-Event warten und Daten fetchen
  try {
    const { users, rulesMessage, formattedUsers } = await new Promise((resolve, reject) => {
      client.once(Events.ClientReady, async (readyClient) => {
        try {
          const my_guild = readyClient.guilds.cache.get(process.env.GUILD_ID);
          if (!my_guild) return reject(new Error('Server (Guild) nicht gefunden!'));

          // my users is fetched now state
          const my_users = await my_guild.members.fetch(); 
          const formattedUsers = []
          for (const [userId, user] of my_users) {
            const data = {
              id: user.id,
              username: user.user.username,
              globalName: user.user.globalName,
              displayName: user.displayName,
              bot: user.user.bot,
              avatarUrl: user.displayAvatarURL({ forceStatic: false }),
            }
            formattedUsers.push(data)
            
          } 
          
          
          const my_rules_channel = my_guild.channels.cache.get(process.env.CHANNEL_ID_RULES);
          if (!my_rules_channel || !my_rules_channel.isTextBased()) {
             return reject(new Error('Regel-Kanal nicht gefunden oder nicht textbasiert!'));
          }
          const my_rulesMessage = await my_rules_channel.messages.fetch(process.env.MESSAGE_ID_RULES);
          
          resolve({
            users: my_users,
            formattedUsers: formattedUsers,
            rulesMessage: my_rulesMessage,
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    
    console.log(`Bot erfolgreich gestartet! ${users.size} Mitglieder geladen.`);
    
    // hieraus ein Promise möglich ?

    //singletonapplikation await
    logUsers(formattedUsers);
    //singletonapplikation await
    checkRoles(users, rulesMessage)

    /*checkPublishedTopics()
    cleanTopicThread()*/
    await Promise.all([
      cleanTopicThread(),
      checkPublishedTopics(),
      assingTopicRoles()
    ])

  } catch (error) {
    console.error("Fehler beim Initialisieren des Bots:", error);
  }


  // 4. Den Client für die restliche App zurückgeben
  return client;
}

module.exports = { createDiscordClient };
