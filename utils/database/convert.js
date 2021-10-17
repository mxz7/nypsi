/**
 *
 * ~ used to convert old .json storage system into database system ~
 *
 *  this file should be ran as its own thing, without a database file present
 *
 */

console.time("runtime")

const Database = require("better-sqlite3")
const fs = require("fs")
const db = new Database("./utils/database/storage.db", { verbose: console.log })

function createTables() {
    db.prepare(
        "CREATE TABLE IF NOT EXISTS economy ('id' TEXT PRIMARY KEY, 'money' INTEGER DEFAULT 500 NOT NULL , 'bank' INTEGER DEFAULT 4500 NOT NULL, 'xp' INTEGER DEFAULT 0 NOT NULL, 'prestige' INTEGER DEFAULT 0 NOT NULL, 'padlock' BOOLEAN DEFAULT FALSE, 'dms' BOOLEAN DEFAULT TRUE, 'last_vote' BOOLEAN DEFAULT 0, 'inventory' TEXT DEFAULT '{}', 'workers' TEXT DEFAULT '{}')"
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
}

createTables()

function toArray(string, seperator) {
    const d = string.split(seperator || "#@|@#")

    if (string == "") {
        return []
    }

    if (d.length == 2 && d[0] == "") {
        d.splice(0, 1)
    }

    return d
}

function toStorage(array, seperator) {
    return array.join(seperator || "#@|@#")
}

function convertEconomy() {
    const file = JSON.parse(fs.readFileSync("./utils/economy/users.json"))

    for (let user in file) {
        const id = user
        user = file[user]

        db.prepare(
            "INSERT INTO economy (id, money, bank, xp, prestige, padlock, dms, last_vote, inventory, workers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
            id,
            user.money.balance,
            user.money.bank,
            user.xp,
            user.prestige,
            user.padlock ? 1 : 0,
            user.dms ? 1 : 0,
            user.lastVote,
            JSON.stringify(user.inventory),
            JSON.stringify(user.workers)
        )
    }
}

convertEconomy()

function convertGuilds() {
    const file = JSON.parse(fs.readFileSync("./utils/guilds/data.json"))

    for (let guild in file) {
        const id = guild
        guild = file[guild]

        db.prepare(
            "INSERT INTO guilds (id, peak, disabled_commands, snipe_filter, chat_filter, prefix, countdowns) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).run(
            id,
            guild.peaks.members,
            toStorage(guild.disabledCommands),
            toStorage(guild.snipeFilter),
            toStorage(guild.chatFilter),
            guild.prefix,
            JSON.stringify(guild.countdowns) ? JSON.stringify(guild.countdowns) : "{}"
        )

        db.prepare(
            "INSERT INTO guilds_counters (guild_id, enabled, format, filter_bots, channel) VALUES (?, ?, ?, ?, ?)"
        ).run(
            id,
            guild.counter.enabled ? 1 : 0,
            guild.counter.format,
            guild.counter.filterBots ? 1 : 0,
            guild.counter.channel
        )

        if (guild.xmas) {
            db.prepare("INSERT INTO guilds_christmas (guild_id, enabled, format, channel) VALUES (?, ?, ?, ?)").run(
                id,
                guild.xmas.enabled ? 1 : 0,
                guild.xmas.format,
                guild.xmas.channel
            )
        } else {
            db.prepare("INSERT INTO guilds_christmas (guild_id) VALUES (?)").run(id)
        }
    }
}

convertGuilds()

function convertModeration() {
    const file = JSON.parse(fs.readFileSync("./utils/moderation/data.json"))

    for (let guild in file) {
        const id = guild
        guild = file[id]

        const mutes = guild.mutes
        const bans = guild.bans
        const cases = guild.cases

        db.prepare("INSERT INTO moderation (id, case_count, mute_role) VALUES (?, ?, ?)").run(
            id,
            guild.caseCount,
            guild.muteRole ? guild.muteRole : ""
        )

        for (let case0 of cases) {
            db.prepare(
                "INSERT INTO moderation_cases (case_id, type, user, moderator, command, time, deleted, guild_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            ).run(case0.id, case0.type, case0.user, case0.moderator, case0.command, case0.time, case0.deleted ? 1 : 0, id)
        }

        for (let mute of mutes) {
            db.prepare("INSERT INTO moderation_mutes (user, unmute_time, guild_id) VALUES (?, ?, ?)").run(
                mute.user,
                mute.unmuteTime,
                id
            )
        }

        for (let ban of bans) {
            db.prepare("INSERT INTO moderation_bans (user, unban_time, guild_id) VALUES (?, ?, ?)").run(
                ban.user,
                ban.unbanTime,
                id
            )
        }
    }
}

convertModeration()

function convertPremium() {
    const file = JSON.parse(fs.readFileSync("./utils/premium/data.json"))

    for (let user in file) {
        const id = user
        user = file[id]

        if (user.level == 0) continue

        db.prepare(
            "INSERT INTO premium (id, level, embed_color, last_daily, last_weekly, status, revoke_reason, start_date, expire_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
            id,
            user.level,
            user.embedColor,
            user.lastDaily,
            user.lastWeekly,
            user.status,
            user.revokeReason,
            user.startDate,
            user.expireDate
        )
    }
}

convertPremium()

function convertChatReactions() {
    const file = JSON.parse(fs.readFileSync("./utils/chatreactions/data.json"))

    for (let guild in file) {
        const id = guild
        guild = file[id]

        db.prepare(
            "INSERT INTO chat_reaction (id, word_list, random_start, random_channels, between_events, random_modifier, timeout, blacklisted) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
            id,
            toStorage(guild.wordList),
            guild.settings.randomStart ? 1 : 0,
            toStorage(guild.settings.randomChannels),
            guild.settings.timeBetweenEvents,
            guild.settings.randomModifier,
            guild.settings.timeout,
            toStorage(guild.blacklisted)
        )

        for (let user in guild.stats) {
            const userID = user
            user = guild.stats[userID]

            db.prepare(
                "INSERT INTO chat_reaction_stats (guild_id, user_id, wins, second, third) VALUES (?, ?, ?, ?, ?)"
            ).run(id, userID, user.wins, user.secondPlace, user.thirdPlace)
        }
    }
}

convertChatReactions()

console.timeEnd("runtime")
