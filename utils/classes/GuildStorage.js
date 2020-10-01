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
            disabledCommands: [],
            snipeFilter: ["discord.gg", "/invite/"],
            chatFilter: [],
            prefix: "$"
        }
        return this.guild
    }
}