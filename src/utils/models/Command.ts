import { SlashCommandBuilder } from "@discordjs/builders"
import { Collection, CommandInteraction, GuildMember, Message, User } from "discord.js"

export class Command {
    public name: string
    public description: string
    public category: string
    public permissions?: Array<string>
    public aliases?: Array<string>
    public slashData: SlashCommandBuilder
    public slashEnabled: boolean
    public run: (message: Message, args: Array<string>) => void

    constructor(name: string, description: string, category: Categories) {
        this.name = name.toLowerCase()
        this.description = description.toLowerCase()
        this.category = category.toLowerCase()

        this.slashEnabled = false

        this.slashData = new SlashCommandBuilder().setName(this.name).setDescription(this.description)

        return this
    }

    public setPermissions(permissions: Array<string>) {
        this.permissions = permissions
        return this
    }

    public setAliases(aliases: Array<string>) {
        this.aliases = aliases
        return this
    }

    public setRun(run: (message: Message, args: Array<string>) => void) {
        this.run = run
        return this
    }
}

export enum Categories {
    NONE = "none",
    ANIMALS = "animals",
    FUN = "fun",
    INFO = "info",
    MONEY = "money",
    MODERATION = "moderation",
    ADMIN = "admin",
    MINECRAFT = "minecraft",
    UTILITY = "utility",
    NSFW = "nsfw",
}

export class NypsiCommandInteraction extends CommandInteraction {
    public author: User
    declare member: GuildMember
    public mentions?: {
        members: Collection<string, GuildMember>
    }
}

// export type NypsiCommandInteraction = CommandInteraction & {
//     author: User
// }

// export class NypsiCommandInteraction extends CommandInteraction {
//     constructor(data) {
//         super()
//     }
// }
