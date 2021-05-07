class GuildStorage {
    /**
     * @returns {GuildStorage}
     * @param {Collection} members
     * @param {Collection} onlines
     */
    constructor(members, onlines) {
        this.guild = {
            peaks: {
                members: members,
                onlines: onlines,
            },
            counter: {
                enabled: false,
                format: "members: %count% (%peak%)",
                filterBots: true,
                channel: "none",
            },
            xmas: {
                enabled: false,
                format: "`%days%` days until christmas",
                channel: "none",
            },
            disabledCommands: [],
            snipeFilter: [],
            chatFilter: [],
            prefix: "$",
            countdowns: {},
        }
        return this.guild
    }
}

exports.GuildStorage = GuildStorage

class Countdown {
    /**
     * @returns {Countdown}
     * @param {Date} date
     * @param {String} format
     * @param {String} finalFormat
     * @param {String} channel
     * @param {String} id
     */
    constructor(date, format, finalFormat, channel, id) {
        this.date = date
        this.format = format
        this.finalFormat = finalFormat
        this.channel = channel
        this.id = id

        return this
    }
}

exports.Countdown = Countdown
