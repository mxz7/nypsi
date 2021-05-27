const { GuildMember } = require("discord.js")
const { getDatabase } = require("../database/database")

const db = getDatabase()

/**
 * 
 * @param {GuildMember} member 
 */
function createUsernameProfile(member) {
    db.prepare("INSERT INTO username_optout (id) VALUES (?)").run(member.user.id)
    db.prepare("INSERT INTO usernames (id, username, date) VALUES (?, ?, ?)").run(member.user.id, member.user.tag, Date.now())
}

exports.createUsernameProfile = createUsernameProfile

/**
 * @returns {Boolean}
 * @param {GuildMember} member
 */
function usernameProfileExists(member) {
    let id = member

    if (member.user) id = member.user.id

    const query = db.prepare("SELECT id FROM usernames_optout WHERE id = ?").get(member.user.id)

    if (query) {
        return true
    } else {
        return false
    }
}

exports.usernameProfileExists = usernameProfileExists