/**
 * converts old economy stats json data to database
 */

const Database = require("better-sqlite3/lib/database")
const fs = require("fs")

const db = new Database("./utils/database/storage.db", { verbose: console.log })
db.pragma("journal_mode = WAL")

const stats = JSON.parse(fs.readFileSync("./utils/economy/stats.json"))

const robDB = db.prepare("INSERT INTO economy_stats (id, type, win, lose) VALUES (?, ?, ?, ?)")
const itemDB = db.prepare("INSERT INTO economy_stats (id, type, win) VALUES (?, ?, ?)")
const gambleDB = db.prepare("INSERT INTO economy_stats (id, type, win, lose, gamble) VALUES (?, ?, ?, ?, 1)")

for (const user in stats) {
    const data = stats[user]

    robDB.run(user, "rob", data.rob.wins, data.rob.lose)

    for (const item in data.items) {
       itemDB.run(user, item, data.items[item])
    }

    for (const game in data.gamble) {
        const gameData = data.gamble[game]

        gambleDB.run(user, game, gameData.wins, gameData.lose)
    }

    console.log(data)
}