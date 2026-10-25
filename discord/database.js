const mysql = require("mysql2/promise")

const database = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "",
    database: "discord"
}) 
if(database) console.log(`erfolgreich mit der Datenbank Discord ${database.name} verbunden`)

module.exports = database