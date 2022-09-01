import {
    ActionRowBuilder,
    ApplicationCommandOptionType,
    Collection,
    CommandInteraction,
    CommandInteractionOption,
    EmbedBuilder,
    GuildMember,
    Interaction,
    InteractionType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import { runCommand } from "../utils/commandhandler";
import prisma from "../utils/database/database";
import {
    createUser,
    getBalance,
    getInventory,
    getItems,
    setInventory,
    updateBalance,
    userExists,
} from "../utils/economy/utils";
import requestDM from "../utils/functions/requestdm";
import { getSurveyByMessageId } from "../utils/functions/surveys";
import { getChatFilter } from "../utils/guilds/utils";
import { getKarma, getKarmaShopItems, isKarmaShopOpen } from "../utils/karma/utils";
import { logger } from "../utils/logger";
import { NypsiClient } from "../utils/models/Client";
import { createNypsiInteraction, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

export default async function interactionCreate(interaction: Interaction) {
    if (interaction.type == InteractionType.ApplicationCommandAutocomplete) {
        const focused = interaction.options.getFocused(true);

        if (focused.name == "item") {
            const inventory = await getInventory(interaction.user.id);

            if (!inventory) return;

            const items = getItems();

            let options = Object.keys(inventory).filter(
                (item) =>
                    item.startsWith(focused.value) ||
                    items[item].name.startsWith(focused.value) ||
                    items[item].aliases?.includes(focused.value)
            );

            if (options.length > 25) options = options.splice(0, 24);

            if (options.length == 0) return;

            const formatted = options.map((i) => ({
                name: `${items[i].emoji.startsWith("<:") || items[i].emoji.startsWith("<:a") ? "" : `${items[i].emoji} `}${
                    items[i].name
                } [${inventory[i].toLocaleString()}]`,
                value: i,
            }));

            return await interaction.respond(formatted);
        } else if (focused.name == "item-buy") {
            const items = getItems();

            let options = Object.keys(items).filter(
                (item) =>
                    (item.startsWith(focused.value) ||
                        items[item].name.startsWith(focused.value) ||
                        items[item].aliases?.includes(focused.value)) &&
                    items[item].buy
            );

            if (options.length > 25) options = options.splice(0, 24);

            if (options.length == 0) return;

            const formatted = options.map((i) => ({
                name: `${items[i].emoji.startsWith("<:") || items[i].emoji.startsWith("<:a") ? "" : `${items[i].emoji} `}${
                    items[i].name
                }`,
                value: i,
            }));

            return await interaction.respond(formatted);
        } else if (focused.name == "car") {
            const inventory = await getInventory(interaction.user.id);

            const items = getItems();

            let options = Object.keys(inventory).filter(
                (item) =>
                    (item.startsWith(focused.value) ||
                        items[item].name.startsWith(focused.value) ||
                        items[item].aliases?.includes(focused.value)) &&
                    items[item].role == "car"
            );

            options.push("cycle");

            if (options.length > 25) options = options.splice(0, 24);

            if (options.length == 0) return;

            const formatted = options.map((i) => ({
                name: `${items[i].emoji.startsWith("<:") || items[i].emoji.startsWith("<:a") ? "" : `${items[i].emoji} `}${
                    items[i].name
                }`,
                value: i,
            }));

            return await interaction.respond(formatted);
        } else if (focused.name == "item-karmashop") {
            if (interaction.guild.id != "747056029795221513") return;
            if (!isKarmaShopOpen()) return;

            const items = getKarmaShopItems();
            const karma = await getKarma(interaction.user.id);

            let options = Object.keys(items).filter(
                (item) =>
                    (item.startsWith(focused.value) || items[item].name.startsWith(focused.value)) &&
                    items[item].items_left > 0 &&
                    items[item].cost <= karma
            );

            if (options.length > 25) options = options.splice(0, 24);

            if (options.length == 0) return;

            const formatted = options.map((i) => ({
                name: `${items[i].emoji.startsWith("<:") || items[i].emoji.startsWith("<:a") ? "" : `${items[i].emoji} `}${
                    items[i].name
                }`,
                value: i,
            }));

            return await interaction.respond(formatted);
        } else if (focused.name == "item-global") {
            const items = getItems();

            let options = Object.keys(items).filter(
                (item) =>
                    item.startsWith(focused.value) ||
                    items[item].name.startsWith(focused.value) ||
                    items[item].aliases?.includes(focused.value)
            );

            if (options.length > 25) options = options.splice(0, 24);

            if (options.length == 0) return;

            const formatted = options.map((i) => ({
                name: `${items[i].emoji.startsWith("<:") || items[i].emoji.startsWith("<:a") ? "" : `${items[i].emoji} `}${
                    items[i].name
                }`,
                value: i,
            }));

            return await interaction.respond(formatted);
        }
    }

    if (interaction.type == InteractionType.MessageComponent) {
        if (interaction.customId == "b") {
            const auction = await prisma.auction.findFirst({
                where: {
                    AND: [{ messageId: interaction.message.id }, { sold: false }],
                },
                select: {
                    bin: true,
                    messageId: true,
                    id: true,
                    ownerId: true,
                    itemAmount: true,
                    itemName: true,
                },
            });

            if (auction && (await userExists(auction.ownerId))) {
                if (auction.ownerId == interaction.user.id) {
                    return await interaction.reply({
                        embeds: [new ErrorEmbed("you cannot buy your own auction")],
                        ephemeral: true,
                    });
                }

                if (!(await userExists(interaction.user.id))) await createUser(interaction.user.id);

                const balance = await getBalance(interaction.user.id);

                if (balance < Number(auction.bin)) {
                    return await interaction.reply({ embeds: [new ErrorEmbed("you cannot afford this")], ephemeral: true });
                }

                await prisma.auction
                    .update({
                        where: {
                            id: auction.id,
                        },
                        data: {
                            sold: true,
                        },
                    })
                    .catch(() => {});

                const inventory = await getInventory(interaction.user.id);

                if (inventory[auction.itemName]) {
                    inventory[auction.itemName] += auction.itemAmount;
                } else {
                    inventory[auction.itemName] = auction.itemAmount;
                }

                await setInventory(interaction.user.id, inventory);
                await updateBalance(interaction.user.id, balance - Number(auction.bin));
                await updateBalance(auction.ownerId, (await getBalance(auction.ownerId)) + Number(auction.bin));

                const items = getItems();

                const embedDm = new CustomEmbed()
                    .setColor("#36393f")
                    .setDescription(
                        `your auction for ${auction.itemAmount}x ${items[auction.itemName].emoji} ${
                            items[auction.itemName].name
                        } has been bought by ${interaction.user.username} for $**${auction.bin.toLocaleString()}**`
                    );

                await requestDM({
                    client: interaction.client as NypsiClient,
                    memberId: auction.ownerId,
                    content: "your auction has been bought",
                    embed: embedDm,
                });

                const embed = new EmbedBuilder(interaction.message.embeds[0].data);

                const desc = embed.data.description.split("\n\n");

                desc[0] = `**bought** by ${interaction.user.username} <t:${Math.floor(Date.now() / 1000)}:R>`;

                embed.setDescription(desc.join("\n\n"));

                await interaction.message.edit({ embeds: [embed], components: [] });

                logger.info(
                    `auction ${auction.id} by ${auction.ownerId} bought by ${interaction.user.tag} (${interaction.user.id})`
                );
            } else {
                await interaction.reply({ embeds: [new ErrorEmbed("invalid auction")], ephemeral: true });
                await interaction.message.delete();
            }
        } else if (interaction.customId == "a") {
            const survey = await getSurveyByMessageId(interaction.message.id);

            if (!survey) {
                return await interaction.reply({
                    embeds: [new ErrorEmbed("this survey no longer exists")],
                    ephemeral: true,
                });
            }

            const hasResponed = await prisma.surveyData.findUnique({
                where: {
                    userId_surveyId: {
                        surveyId: survey.id,
                        userId: interaction.user.id,
                    },
                },
            });

            if (hasResponed) {
                return await interaction.reply({
                    embeds: [new ErrorEmbed("you have already answered to this survey")],
                    ephemeral: true,
                });
            }

            const modal = new ModalBuilder().setCustomId("survey-answer").setTitle("answer survey");

            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("answer")
                        .setLabel(survey.surveyText)
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(50)
                )
            );

            await interaction.showModal(modal);

            const filter = (i: Interaction) => i.user.id == interaction.user.id;

            const res = await interaction.awaitModalSubmit({ filter, time: 120000 }).catch(() => {});

            if (!res) return;

            const descFilter = [
                "nigger",
                "nigga",
                "faggot",
                "fag",
                "nig",
                "ugly",
                "discordgg",
                "discordcom",
                "discordappcom",
            ];

            let value = res.fields.getTextInputValue("answer").toLowerCase().normalize("NFD");

            value = value.replace(/[^A-z0-9\s]/g, "");

            for (const word of descFilter) {
                if (value.includes(word))
                    return res.reply({ embeds: [new ErrorEmbed("your response had a filtered word")] });
            }

            const serverFilter = await getChatFilter(interaction.guild);

            for (const word of serverFilter) {
                if (value.includes(word))
                    return res.reply({ embeds: [new ErrorEmbed("your response had a filtered word")] });
            }

            await prisma.surveyData.create({
                data: {
                    userId: interaction.user.id,
                    value: value,
                    surveyId: survey.id,
                },
            });

            await res.reply({
                embeds: [new CustomEmbed(res.member as GuildMember, "✅ your answer has been taken")],
                ephemeral: true,
            });

            const embed = new CustomEmbed();

            embed.setColor(interaction.message.embeds[0].color);
            embed.setHeader(interaction.message.embeds[0].author.name, interaction.message.embeds[0].author.iconURL);
            embed.setDescription(
                `${survey.surveyText}\n\nanswers: \`${(
                    survey.SurveyData.length + 1
                ).toLocaleString()}\`\nends <t:${Math.floor(survey.resultsAt.getTime() / 1000)}:R>`
            );

            return await interaction.message.edit({ embeds: [embed] }).catch(() => {});
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
    setTimeout(async () => {
        if (interaction.replied) return;
        await interaction.deferReply().catch(() => {
            logger.warn(`failed to defer slash command. ${interaction.commandName} by ${interaction.member.user.username}`);
            fail = true;
        });
    }, 2000);

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
