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

    const string = interaction.options.getString("reason")
    const user = interaction.options.getUser("user")
    const integer = interaction.options.getInteger("bet")

    const args = [""]

    if (user) {
        args.push(`<@${user.id}>`)
        const guildMember = await interaction.guild.members.fetch(user.id)

        if (guildMember) {
            const collection = new Collection()
            collection.set(user.id, guildMember)
            message.mentions = {
                members: collection
            }
        }
    }

    if (string) {
        for (const str of string.split(" ")) {
            args.push(str)
        }
    }

    if (integer) {
        args.push(integer.toString())
    }

    message.interaction = true

    return runCommand(interaction.commandName, message, args)
}