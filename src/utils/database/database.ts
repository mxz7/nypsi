import * as Database from "better-sqlite3"
import { databaseLog, logger } from "../logger"
const db = new Database("./out/data/storage.db", { verbose: databaseLog })

db.pragma("journal_mode = WAL")

function createTables() {
    db.prepare(
        "CREATE TABLE IF NOT EXISTS economy ('id' TEXT PRIMARY KEY, 'money' INTEGER DEFAULT 5000 NOT NULL , 'bank' INTEGER DEFAULT 0 NOT NULL, 'xp' INTEGER DEFAULT 0 NOT NULL, 'prestige' INTEGER DEFAULT 0 NOT NULL, 'padlock' BOOLEAN DEFAULT FALSE, 'dms' BOOLEAN DEFAULT TRUE, 'last_vote' INTEGER DEFAULT 0, 'inventory' TEXT DEFAULT '{}', 'workers' TEXT DEFAULT '{}', 'banned' INTEGER DEFAULT 0)"
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

    db.prepare(
        "CREATE TABLE IF NOT EXISTS lastfm ('id' TEXT NOT NULL PRIMARY KEY, 'username' TEXT, 'monthly_update' BOOLEAN DEFAULT 0)"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS karma ('id' TEXT NOT NULL PRIMARY KEY, 'karma' INTEGER NOT NULL DEFAULT 1, 'last_command' INTEGER DEFAULT 0)"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS mentions ('guild_id' TEXT NOT NULL, 'target_id' TEXT NOT NULL, 'date' INTEGER NOT NULL, 'user_tag' TEXT NOT NULL, 'url' TEXT NOT NULL, 'content' TEXT NOT NULL)"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS lottery_tickets ('id' INTEGER NOT NULL PRIMARY KEY, 'user_id' TEXT NOT NULL)"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS economy_stats ('id' TEXT NOT NULL, 'type' TEXT NOT NULL, 'win' INTEGER NOT NULL DEFAULT 0, 'lose' INTEGER NOT NULL DEFAULT 0, 'gamble' INTEGER NOT NULL DEFAULT 0)"
    ).run()

    db.prepare(
        "CREATE TABLE IF NOT EXISTS premium_commands ('owner' TEXT NOT NULL PRIMARY KEY, 'trigger' TEXT NOT NULL, 'content' TEXT NOT NULL, 'uses' INTEGER NOT NULL DEFAULT 0)"
    ).run()
}

createTables()

function runBackups() {
    setInterval(doBackup, 43200000)
}

runBackups()

export function doBackup() {
    logger.info("data backup starting..")

    const date = new Date()

    db.backup(
        `./out/data/backups/${date.getDate()}.${
            date.getMonth() + 1
        }.${date.getFullYear()} ${date.getHours()}.${date.getMinutes()}.db`
    )
        .then(() => {
            logger.log({
                level: "success",
                message: "backup complete",
            })
        })
        .catch((e) => {
            logger.error("backup failed")
            logger.error(e)
        })
}

/**
 *
 * @param {String} string string from database
 * @param {String} seperator optional seperator
 */
export function toArray(string: string, seperator?: string): Array<string> {
    const d = string.split(seperator || "#@|@#")

    for (const thing of d) {
        if (thing == "") {
            d.splice(d.indexOf(thing), 1)
        }
    }

    return d
}

/**
 *
 * @param {Array<String>} array
 * @param {String} seperator
 * @returns
 */
export function toStorage(array: Array<string>, seperator?: string): string {
    return array.join(seperator || "#@|@#")
}

/**
 * @returns {Database.Database}
 */
export function getDatabase(): Database.Database {
    return db
}

export function vacuum() {
    db.prepare("VACUUM").run()
}
