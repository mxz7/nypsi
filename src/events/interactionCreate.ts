import {
    ApplicationCommandOptionType,
    Collection,
    CommandInteraction,
    CommandInteractionOption,
    GuildMember,
    Interaction,
    InteractionType,
} from "discord.js";
import { runCommand } from "../utils/commandhandler";
import { logger } from "../utils/logger";
import { createNypsiInteraction, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed } from "../utils/models/EmbedBuilders";

export default async function interactionCreate(interaction: Interaction) {
    if (interaction.type != InteractionType.ApplicationCommand) return;

    if (!interaction.guild) {
        const embed = new CustomEmbed()
            .setHeader("nypsi")
            .setColor("#36393f")
            .setDescription(
                "unfortunately you can't do commands in direct messages ):\n\n" +
                    "if you need support or help for nypsi, please join the official nypsi server: https://discord.gg/hJTDNST"
            );
        return await interaction.reply({ embeds: [embed] });
    }

    const message: CommandInteraction & NypsiCommandInteraction = createNypsiInteraction(interaction);

    const args = [""];

    let fail = false;
    await interaction.deferReply().catch(() => {
        logger.warn(`failed to defer slash command. ${interaction.commandName} by ${interaction.member.user.username}`);
        fail = true;
    });
    if (fail) return;

    const parseArgument = async (arg: CommandInteractionOption) => {
        switch (arg.type) {
            case ApplicationCommandOptionType.User:
                const user = arg.user;
                args.push(`<@${user.id}>`);
                const guildMember = await interaction.guild.members.fetch(user.id);

                if (guildMember) {
                    const collection: Collection<string, GuildMember> = new Collection();
                    collection.set(user.id, guildMember);
                    message.mentions = {
                        members: collection,
                    };
                }
                break;
            case ApplicationCommandOptionType.String:
                for (const str of arg.value.toString().split(" ")) {
                    args.push(str);
                }
                break;
            case ApplicationCommandOptionType.Integer:
                args.push(arg.value.toString());
                break;
            case ApplicationCommandOptionType.Channel:
                // @ts-expect-error will always error bc typescript doesnt know type has been validated
                args.push(arg.value);
                break;
            case ApplicationCommandOptionType.SubcommandGroup:
                args.push(arg.name);
                for (const arg1 of arg.options) {
                    await parseArgument(arg1);
                }
                break;
            case ApplicationCommandOptionType.Subcommand:
                args.push(arg.name);
                for (const arg1 of arg.options) {
                    await parseArgument(arg1);
                }
                break;
        }
    };

    for (const arg of interaction.options.data) {
        await parseArgument(arg);
    }

    message.content = `[/]${interaction.commandName} ${args.join(" ")}`;

    return runCommand(interaction.commandName, message, args);
}
