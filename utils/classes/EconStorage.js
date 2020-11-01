const { GuildMember } = require("discord.js")

exports.EconProfile = class {
    /**
     * @returns {JSON}
     */
    constructor() {
        this.money = {
            balance: 500,
            bank: 4500
        }
        this.xp = 0
        this.prestige = 0
        this.padlock = false
        this.dms = true
        this.usedItem = null
        this.inventory = {
            vote: 0,
            prestige: 0,
            basic: 0
        }
        this.workers = {}
        return this
    }
}