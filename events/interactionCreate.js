const { Interaction, User, Collection } = require("discord.js")
const { runCommand } = require("../utils/commandhandler")

/**
 * 
 * @param {Interaction} interaction 
 */
module.exports = async (interaction) => {
    if (!interaction.isCommand()) return

    const message = interaction

    /**
     * @type {User}
     */
    message.author = interaction.user

    const args = [""]

    for (const arg of interaction.options.data) {
        if (arg.type == "USER") {
            const user = arg.user
            args.push(`<@${user.id}>`)
            const guildMember = await interaction.guild.members.fetch(user.id)

            if (guildMember) {
                const collection = new Collection()
                collection.set(user.id, guildMember)
                message.mentions = {
                    members: collection
                }
            }
        } else if (arg.type == "STRING") {
            for (const str of arg.value.split(" ")) {
                args.push(str)
            }
        } else if (arg.type == "INTEGER") {
            args.push(arg.value.toString())
        }
    }

    message.interaction = true

    return runCommand(interaction.commandName, message, args)
}