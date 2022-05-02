import { Collection, CommandInteractionOption, GuildMember } from "discord.js"
import { runCommand } from "../utils/commandhandler"
import { NypsiCommandInteraction } from "../utils/models/Command"

/**
 *
 * @param {Interaction} interaction
 */
module.exports = async (interaction: any): Promise<NypsiCommandInteraction> => {
    if (!interaction.isCommand()) return

    interaction.author = interaction.user

    const message: NypsiCommandInteraction = interaction

    const args = [""]

    /**
     *
     * @param {CommandInteractionOption} arg
     */
    const parseArgument = async (arg: CommandInteractionOption) => {
        switch (arg.type) {
            case "USER":
                const user = arg.user
                args.push(`<@${user.id}>`)
                const guildMember = await interaction.guild.members.fetch(user.id)

                if (guildMember) {
                    const collection: Collection<string, GuildMember> = new Collection()
                    collection.set(user.id, guildMember)
                    message.mentions = {
                        members: collection,
                    }
                }
                break
            case "STRING":
                for (const str of arg.value.toString().split(" ")) {
                    args.push(str)
                }
                break
            case "INTEGER":
                args.push(arg.value.toString())
                break
            case "CHANNEL":
                // @ts-expect-error will always error bc typescript doesnt know type has been validated
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

    return runCommand(interaction.commandName, message, args)
}
