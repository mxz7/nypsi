const { GuildMember } = require("discord.js")

class EconProfile {
    /**
     * @returns {EconProfile}
     */
    constructor() {
        this.money = {
            balance: 500,
            bank: 4500,
        }
        this.xp = 0
        this.prestige = 0
        this.padlock = false
        this.dms = true
        this.workers = {}
        return this
    }
}

exports.EconProfile = EconProfile
