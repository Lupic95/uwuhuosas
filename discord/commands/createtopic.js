const { SlashCommandBuilder } = require('discord.js');
const database = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createtopic')
        .setDescription('Creates a topic request')
        .addStringOption(option => 
            option.setName('topicname')
                .setDescription('Will be the channel name, after the server owner allowed the topic')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('emoji')
                .setDescription('Use an EMOJI that will correspond to your topic name')
                .setRequired(true)
        )
        .addStringOption(option => 
            option.setName('hexcolor')
                .setDescription('Use a hex color code (e.g., #000000) to create a topic color')
                .setRequired(true)
        ),

    async execute(interaction) {
        // 1. Sofort die Interaktion aufschieben (Verhindert das Discord-Timeout von 3 Sekunden)
        console.log("[DEBUG 1] Befehl empfangen, schiebe Antwort auf...");
        await interaction.deferReply();

        try {
            // 2. node-emoji dynamisch importieren
            console.log("[DEBUG 2] Lade node-emoji...");
            const { unemojify } = await import('node-emoji');

            const topicname = interaction.options.getString('topicname'); 
            const emoji = interaction.options.getString('emoji');
            const hexColor = interaction.options.getString('hexcolor');

            // 3. Emoji umwandeln (z.B. 🍕 -> :pizza:)
            const unicode_emoji = unemojify(emoji); 
            console.log(`[DEBUG 3] Eingabe-Emoji: ${emoji} -> Umgewandelt zu: ${unicode_emoji}`);

            // 4. Erste Datenbank-Abfrage starten
            console.log("[DEBUG 4] Frage bestehende Topics in DB ab...");
            const [topic] = await database.query(`SELECT * FROM topics WHERE topic_name = ?`, [topicname]);
            console.log(`[DEBUG 5] DB-Antwort erhalten. Anzahl gefundener Topics: ${topic ? topic.length : 'undefined'}`);
            
            if (!topic || topic.length === 0) {
                // 5. User-Berechtigung abfragen
                console.log("[DEBUG 6] Frage User aus DB ab...");
                const [user] = await database.query(`SELECT * FROM user WHERE id = ?`, [interaction.user.id]);
                console.log(`[DEBUG 7] DB-Antwort für User erhalten. Gefunden: ${user ? user.length : 'undefined'}`);
                
                if (user && user.length === 1) {
                    // 6. Datensatz einfügen
                    console.log("[DEBUG 8] Füge neues Topic in DB ein...");
                    const result = await database.query(
                        `INSERT INTO topics (owner, topic_name, topic_emoji, topic_color) VALUES (?, ?, ?, ?)`,
                        [user[0].ai_user, topicname, unicode_emoji, hexColor] // Wichtig: user[0].ai_user nutzen!
                    );
                    console.log("[DEBUG 9] Topic erfolgreich in DB eingetragen.");

                    if (result) {
                        await interaction.editReply({
                            content: `We created your topic: *${topicname}*. You, **${interaction.user}**, are the owner. Please wait until it is published by the server owner.\n`
                            + `We created the role demanding to your topic *${topicname}* with the color code *${hexColor}*.`
                        });
                    } else {
                        await interaction.editReply({ content: `Insert into database failed for: ${topicname}` });
                    }
                } else {
                    await interaction.editReply({
                        content: `We didn't find a user in our database for **${interaction.user}**. You have no permissions to create the topic: *${topicname}*.`
                    });
                }
                
            } else {
                // Wichtig: Da 'topic' ein Array ist, nehmen wir das Datum aus dem ersten Eintrag topic[0]
                const timestamp = topic[0] && topic[0].timestamp ? topic[0].timestamp : 'unknown';
                await interaction.editReply({
                    content: `The topic **${topicname}** was already created at *${timestamp}*.`
                });
            }

        } catch (error) {
            console.error("🔴 EIN FEHLER IST AUFGETRETEN:", error);
            await interaction.editReply({ content: "Beim Ausführen des Befehls ist ein interner Fehler aufgetreten." });
        }
    },
};
