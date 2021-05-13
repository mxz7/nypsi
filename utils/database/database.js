const Database = require("better-sqlite3")
const { info } = require("../logger")
const db = new Database("./utils/database/storage.db", { verbose: info })

function createTables() {
    db.prepare(
        "CREATE TABLE IF NOT EXISTS economy ('id' TEXT PRIMARY KEY, 'money' INTEGER DEFAULT 500, 'bank' INTEGER DEFAULT 4500, 'xp' INTEGER DEFAULT 0, 'prestige' INTEGER DEFAULT 0, 'padlock' BOOLEAN DEFAULT FALSE, 'dms' BOOLEAN DEFAULT FALSE, 'last_vote' BOOLEAN DEFAULSE FALSE, 'inventory' TEXT DEFAULT '{}', 'workers' TEXT DEFAULT '{}')"
    ).run()

    db.prepare("CREATE TABLE IF NOT EXISTS guilds ('id' TEXT PRIMARY KEY, 'peak' INTEGER DEFAULT 0, 'counter' TEXT DEFAULT '{}', 'xmas' TEXT DEFAULT '{}', 'disabled_commands' TEXT DEFAULT '', 'snipe_filter' TEXT DEFAULT '', 'chat_filter' TEXT DEFAULT '', 'prefix' TEXT DEFAULT '$', 'countdowns' TEXT DEFAULT '{}')").run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS moderation ('id' TEXT PRIMARY KEY, 'case_count' INTEGER DEFAULT 0, 'mute_role' TEXT DEFAULT '')"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS moderation_cases ('case_id' TEXT, 'type' TEXT, 'user' TEXT, 'moderator' TEXT, 'command' TEXT, 'time' INTEGER, 'deleted' BOOLEAN, 'guild_id' TEXT, FOREIGN KEY (guild_id) REFERENCES moderation (id))"
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