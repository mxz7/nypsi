import {
    Collection,
    CommandInteraction,
    GuildMember,
    Message,
    Role,
    SlashCommandBuilder,
    TextBasedChannel,
    User,
} from "discord.js";

export class Command {
    public name: string;
    public description: string;
    public category: string;
    public permissions?: Array<string>;
    public aliases?: Array<string>;
    public slashData?: SlashCommandBuilder;
    public slashEnabled: boolean;
    public data?: any;
    public run: (message: Message | (NypsiCommandInteraction & CommandInteraction), args?: Array<string>) => void;

    constructor(name: string, description: string, category: Categories) {
        this.name = name.toLowerCase();
        this.description = description.toLowerCase();
        this.category = category.toLowerCase();

        this.slashEnabled = false;

        this.slashData = new SlashCommandBuilder().setName(this.name).setDescription(this.description);

        return this;
    }

    public setPermissions(permissions: Array<string>) {
        this.permissions = permissions;
        return this;
    }

    public setAliases(aliases: Array<string>) {
        this.aliases = aliases;
        return this;
    }

    public setRun(run: (message: Message | (NypsiCommandInteraction & CommandInteraction), args?: Array<string>) => void) {
        this.run = run;
        return this;
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
    MUSIC = "music",
    UTILITY = "utility",
    NSFW = "nsfw",
}

export interface NypsiCommandInteraction extends CommandInteraction {
    author?: User;
    mentions?: {
        members?: Collection<string, GuildMember>;
        roles?: Collection<string, Role>;
        channels?: Collection<string, TextBasedChannel>;
    };
    member: GuildMember;
    interaction?: boolean;
    content?: string;
}

export function createNypsiInteraction(interaction: any): NypsiCommandInteraction & CommandInteraction {
    interaction.author = interaction.user;
    interaction.interaction = true;
    return interaction;
}
