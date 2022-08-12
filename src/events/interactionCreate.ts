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
import prisma from "../utils/database/database";
import { getBalance, updateBalance, userExists } from "../utils/economy/utils";
import { logger } from "../utils/logger";
import { NypsiClient } from "../utils/models/Client";
import { createNypsiInteraction, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

export default async function interactionCreate(interaction: Interaction) {
    if (interaction.type == InteractionType.MessageComponent && interaction.customId == "b") {
        const auction = await prisma.auction.findUnique({
            where: {
                messageId: interaction.message.id,
            },
            select: {
                bin: true,
                messageId: true,
                id: true,
            },
        });

        if (auction) {
            if (!(await userExists(interaction.user.id))) {
                return await interaction.reply({ embeds: [new ErrorEmbed("you cannot afford this")], ephemeral: true });
            }

            const balance = await getBalance(interaction.user.id);

            if (balance < Number(auction.bin)) {
                return await interaction.reply({ embeds: [new ErrorEmbed("you cannot afford this")], ephemeral: true });
            }

            await prisma.auction
                .delete({
                    where: {
                        id: auction.id,
                    },
                })
                .catch(() => {});
            await updateBalance(interaction.user.id, balance - Number(auction.bin));

            await (interaction.client as NypsiClient).cluster.broadcastEval(
                async (client, { messageId, username }) => {
                    const guild = await client.guilds.fetch("747056029795221513");

                    if (!guild) return;

                    const channel = await guild.channels.fetch("819640200699052052");

                    if (!channel) return;

                    if (channel.isTextBased()) {
                        const msg = await channel.messages.fetch(messageId);

                        if (msg) {
                            const embed = JSON.parse(JSON.stringify(msg.embeds[0]));
                            const desc = embed.description.split("\n\n");

                            desc[0] = `**bought** by ${username} <t:${Math.floor(Date.now() / 1000)}:R>`;

                            embed.description = desc.join("\n\n");

                            await msg.edit({ embeds: [embed], components: [] });
                        }
                    }
                },
                {
                    context: { messageId: auction.messageId, username: interaction.user.username },
                }
            );
        }
    }

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
