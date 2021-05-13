const Database = require("better-sqlite3")
const db = new Database("./utils/database/storage.db")

function createTables() {
    db.prepare(
        "CREATE TABLE IF NOT EXISTS economy ('id' TEXT PRIMARY KEY, 'money' INTEGER, 'bank' INTEGER, 'xp' INTEGER, 'prestige' INTEGER, 'padlock' BOOLEAN, 'dms' BOOLEAN, 'last_vote' BOOLEAN, 'inventory' TEXT, 'workers' TEXT)"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS guilds ('id' TEXT PRIMARY KEY, 'peak' INTEGER, 'counter' TEXT, 'xmas' TEXT, 'disabled_commands' TEXT, 'snipe_filter' TEXT, 'chat_filter' TEXT, 'prefix' TEXT, 'countdowns' TEXT)"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS moderation ('id' TEXT PRIMARY KEY, 'case_count' INTEGER, 'mute_role' TEXT)"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS moderation_cases ('case_id' TEXT, 'type' TEXT, 'user' TEXT, 'moderatir' TEXT, 'command' TEXT, 'time' INTEGER, 'deleted' BOOLEAN, 'guild_id' TEXT, FOREIGN KEY (guild_id) REFERENCES moderation (id))"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS moderation_mutes ('user' TEXT, 'unmute_time' NUMBER, 'guild_id' TEXT, FOREIGN KEY (guild_id) REFERENCES moderation (id))"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS moderation_bans ('user' TEXT, 'unban_time' NUMBER, 'guild_id' TEXT, FOREIGN KEY (guild_id) REFERENCES moderation (id))"
    ).run()
}

createTables()

/**
 *
 * @param {String} string string from database
 * @param {String} seperator optional seperator
 */
function toArray(string, seperator) {
    return string.split(seperator || "|")
}

exports.toArray = toArray

/**
 * @returns {Database}
 */
function getDatabase() {
    return db
}

exports.getDatabase = getDatabase