exports.GuildStorage = class {
    /**
     * @returns {JSON}
     * @param {Collection} members 
     * @param {Collection} onlines 
     */
    constructor(members, onlines) {
        this.guild = {
            peaks: {
                members: members,
                onlines: onlines
            },
            counter: {
                enabled: false,
                format: "members: %count% (%peak%)",
                filterBots: true,
                channel: "none"
            },
            xmas: {
                enabled: false,
                format: "`%days%` days until christmas",
                channel: "none"
            },
            disabledCommands: [],
            snipeFilter: ["discordgg", "discordcom"],
            chatFilter: [],
            prefix: "$"
        }
        return this.guild
    }
}