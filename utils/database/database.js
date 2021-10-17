const Database = require("better-sqlite3")
const { databaseLog, info, types, error } = require("../logger")
const db = new Database("./utils/database/storage.db", { verbose: databaseLog })

function createTables() {
    db.prepare(
        "CREATE TABLE IF NOT EXISTS economy ('id' TEXT PRIMARY KEY, 'money' INTEGER DEFAULT 500 NOT NULL , 'bank' INTEGER DEFAULT 4500 NOT NULL, 'xp' INTEGER DEFAULT 0 NOT NULL, 'prestige' INTEGER DEFAULT 0 NOT NULL, 'padlock' BOOLEAN DEFAULT FALSE, 'dms' BOOLEAN DEFAULT TRUE, 'last_vote' INTEGER DEFAULT 0, 'inventory' TEXT DEFAULT '{}', 'workers' TEXT DEFAULT '{}')"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS guilds ('id' TEXT PRIMARY KEY, 'peak' INTEGER DEFAULT 0, 'disabled_commands' TEXT DEFAULT '', 'snipe_filter' TEXT DEFAULT '', 'chat_filter' TEXT DEFAULT '', 'prefix' TEXT DEFAULT '$', 'countdowns' TEXT DEFAULT '{}')"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS guilds_counters ('guild_id' TEXT, 'enabled' BOOLEAN DEFAULT 0, 'format' TEXT DEFAULT 'members: %count% (%peak%)', 'filter_bots' BOOLEAN DEFAULT 0, 'channel' TEXT DEFAULT 'none', FOREIGN KEY (guild_id) REFERENCES guilds (id))"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS guilds_christmas ('guild_id' TEXT, 'enabled' BOOLEAN DEFAULT 0, 'format' TEXT DEFAULT '`%days%` days until christmas', 'channel' TEXT DEFAULT 'none', FOREIGN KEY (guild_id) REFERENCES guilds (id))"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS moderation ('id' TEXT PRIMARY KEY, 'case_count' INTEGER DEFAULT 0, 'mute_role' TEXT DEFAULT '', 'modlogs' TEXT DEFAULT '')"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS moderation_cases ('case_id' TEXT, 'type' TEXT, 'user' TEXT, 'moderator' TEXT, 'command' TEXT, 'time' INTEGER, 'deleted' BOOLEAN, 'guild_id' TEXT, FOREIGN KEY (guild_id) REFERENCES moderation (id))"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS moderation_mutes ('user' TEXT, 'unmute_time' INTEGER, 'guild_id' TEXT, FOREIGN KEY (guild_id) REFERENCES moderation (id))"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS moderation_bans ('user' TEXT, 'unban_time' INTEGER, 'guild_id' TEXT, FOREIGN KEY (guild_id) REFERENCES moderation (id))"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS premium ('id' TEXT PRIMARY KEY, 'level' INTEGER, 'embed_color' TEXT DEFAULT 'default', 'last_daily' INTEGER DEFAULT 0, 'last_weekly' INTEGER DEFAULT 0, 'status' INTEGER DEFAULT 1, 'revoke_reason' TEXT DEFAULT 'none', 'start_date' INTEGER, 'expire_date' INTEGER)"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS chat_reaction ('id' TEXT PRIMARY KEY, 'word_list' TEXT DEFAULT '', 'random_start' BOOLEAN DEFAULT 0, 'random_channels' TEXT DEFAULT '', 'between_events' INTEGER DEFAULT 600, 'random_modifier' INTEGER DEFAULT 300, 'timeout' INTEGER DEFAULT 60, 'blacklisted' TEXT DEFAULT '')"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS chat_reaction_stats ('guild_id' TEXT, 'user_id' TEXT, 'wins' NUMBER DEFAULT 0, 'second' NUMBER DEFAULT 0, 'third' NUMBER DEFAULT 0, FOREIGN KEY (guild_id) REFERENCES chat_reaction (id))"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS wholesome ('id' INTEGER PRIMARY KEY, 'image' TEXT NOT NULL UNIQUE, 'submitter' TEXT, 'submitter_id' TEXT, 'upload' INTEGER, 'accepter' TEXT NOT NULL)"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS wholesome_suggestions ('id' INTEGER PRIMARY KEY, 'image' TEXT NOT NULL UNIQUE, 'submitter' TEXT, 'submitter_id' TEXT, 'upload' INTEGER)"
    ).run()

    db.prepare("CREATE TABLE IF NOT EXISTS usernames_optout ('id' TEXT PRIMARY KEY, 'tracking' BOOLEAN DEFAULT 1)").run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS usernames ('id' TEXT NOT NULL, 'type' TEXT NOT NULL DEFAULT 'username', 'value' TEXT NOT NULL, 'date' INTEGER NOT NULL, FOREIGN KEY (id) REFERENCES usernames_optout (id))"
    ).run()
}

createTables()

function runBackups() {
    setInterval(() => {
        info("data backup starting..", types.DATA)
        db.backup(`./utils/database/backups/backup-${Date.now()}.db`)
            .then(() => {
                info("backup complete", types.DATA)
            })
            .catch((e) => {
                error("backup failed")
                console.error(e)
            })
    }, 43200000)
}

runBackups()

/**
 *
 * @param {String} string string from database
 * @param {String} seperator optional seperator
 */
function toArray(string, seperator) {
    const d = string.split(seperator || "#@|@#")

    for (const thing of d) {
        if (thing == "") {
            d.splice(d.indexOf(thing), 1)
        }
    }

    return d
}

exports.toArray = toArray

/**
 *
 * @param {Array<String>} array
 * @param {String} seperator
 * @returns
 */
function toStorage(array, seperator) {
    return array.join(seperator || "#@|@#")
}

exports.toStorage = toStorage

/**
 * @returns {Database}
 */
function getDatabase() {
    return db
}

exports.getDatabase = getDatabase
