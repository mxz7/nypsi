const { Interaction, User, Collection, CommandInteractionOption } = require("discord.js")
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

    /**
     * 
     * @param {CommandInteractionOption} arg 
     */
    const parseArgument = async (arg) => {
        switch (arg.type) {
            case "USER":
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
                break
            case "STRING":
                for (const str of arg.value.split(" ")) {
                    args.push(str)
                }
                break
            case "INTEGER":
                args.push(arg.value.toString())
                break
            case "CHANNEL":
                args.push(arg.value)
                break
            case "SUB_COMMAND_GROUP":
                args.push(arg.name)
                for (const arg1 of arg.options) {
                    await parseArgument(arg1)
                }
                break
            case "SUB_COMMAND":
                args.push(arg.name)
                for (const arg1 of arg.options) {
                    await parseArgument(arg1)
                }
                break
        }
    }

    for (const arg of interaction.options.data) {
        await parseArgument(arg)
    }

    message.interaction = true

    return runCommand(interaction.commandName, message, args)
}