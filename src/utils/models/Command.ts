import { SlashCommandBuilder } from "@discordjs/builders"
import { Message } from "discord.js"

export class Command {
    public name: string
    public description: string
    public category: string
    public permissions?: Array<string>
    public data: SlashCommandBuilder
    public slashEnabled: boolean
    public run: (message: Message, args: Array<string>) => void

    constructor(name: string, description: string, category: Categories) {
        this.name = name.toLowerCase()
        this.description = description.toLowerCase()
        this.category = category.toLowerCase()

        this.slashEnabled = false

        this.data = new SlashCommandBuilder().setName(this.name).setDescription(this.description)

        return this
    }

    public setPermissions(permissions: Array<string>) {
        this.permissions = permissions
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
