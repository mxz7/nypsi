import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CommandInteraction,
    Interaction,
    Message,
    MessageActionRowComponentBuilder,
} from "discord.js";
import * as fs from "fs/promises";
import { addCooldown, onCooldown } from "../utils/cooldownhandler.js";
import prisma from "../utils/database/database";
import { getDMsEnabled } from "../utils/economy/utils";
import { getPrefix } from "../utils/guilds/utils";
import { logger } from "../utils/logger";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";

const cmd = new Command("profile", "view your raw data stored in nypsi's database", Categories.INFO).setAliases([
    "data",
    "viewdata",
    "showmemydatazuckerberg",
]);

const cooldown = new Set<string>();

// @ts-expect-error ts doesnt like that
BigInt.prototype.toJSON = function () {
    return this.toString();
};

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (cooldown.has(message.author.id)) {
        return message.channel.send({ embeds: [new ErrorEmbed("please wait before doing that again")] });
    }
    if (await onCooldown(cmd.name, message.member)) {
        const embed = new ErrorEmbed("you have already received your data recently.");

        return message.channel.send({ embeds: [embed] });
    }

    if (!(await getDMsEnabled(message.member))) {
        return await message.channel.send({
            embeds: [new ErrorEmbed(`you must have your dms enabled - (${await getPrefix(message.guild)})dms`)],
        });
    }

    const embed = new CustomEmbed(message.member).setHeader("data request", message.author.avatarURL());

    embed.setDescription("you can request and view all of your data stored by nypsi (excluding moderation data)");

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("y").setLabel("request data").setStyle(ButtonStyle.Success)
    );

    cooldown.add(message.author.id);

    setTimeout(() => {
        cooldown.delete(message.author.id);
    }, 60000);

    const m = await message.channel.send({ embeds: [embed], components: [row] });

    const filter = (i: Interaction) => i.user.id == message.author.id;
    let fail = false;

    const response = await m
        .awaitMessageComponent({ filter, time: 15000 })
        .then(async (collected) => {
            await collected.deferUpdate();
            return collected.customId;
        })
        .catch(async () => {
            fail = true;
        });

    if (fail) return;

    if (typeof response != "string") return;

    if (response == "y") {
        embed.setDescription("fetching your data...");

        await m.edit({ embeds: [embed], components: [] });

        logger.info(`fetching user data for ${message.author.tag}...`);
        const userData = await prisma.user.findUnique({
            where: {
                id: message.author.id,
            },
            include: {
                Economy: {
                    include: {
                        EconomyStats: true,
                    },
                },
                EconomyGuild: true,
                EconomyGuildMember: true,
                Premium: true,
                Username: true,
                WordleStats: true,
            },
        });

        logger.info(`fetching chat reaction stats data for ${message.author.tag}`);
        const chatReactionStats = await prisma.chatReactionStats.findMany({
            where: {
                userId: message.author.id,
            },
        });

        logger.info(`fetching mentions data for ${message.author.tag}`);
        const mentionsTargetedData = await prisma.mention.findMany({
            where: {
                targetId: message.author.id,
            },
        });
        const mentionsSenderData = await prisma.mention.findMany({
            where: {
                userTag: message.author.tag,
            },
        });

        const file = `temp/${message.author.id}.txt`;

        logger.info("packing into text file...");
        await fs.writeFile(
            file,
            `nypsi data for ${message.author.id} (${
                message.author.tag
            } at time of request) - ${new Date().toUTCString()}\n\n----------\nYOUR USER DATA\n----------\n\n`
        );
        await fs.appendFile(file, JSON.stringify(userData, null, 2));
        await fs.appendFile(
            file,
            "\n----------------------------------------------\n\n----------\nYOUR CHAT REACTION DATA\n----------\n\n"
        );
        await fs.appendFile(file, JSON.stringify(chatReactionStats, null, 2));
        await fs.appendFile(
            file,
            "\n----------------------------------------------\n\n----------\nYOUR MENTIONS DATA\n(mentions targetted at you)\n----------\n\n"
        );
        await fs.appendFile(file, JSON.stringify(mentionsTargetedData, null, 2));
        await fs.appendFile(
            file,
            "\n----------------------------------------------\n\n----------\nYOUR MENTIONS DATA\n(mentions from you - based on discord tag)\n----------\n\n"
        );
        await fs.appendFile(file, JSON.stringify(mentionsSenderData, null, 2));

        const buffer = await fs.readFile(file);

        let fail = false;
        await message.member
            .send({
                files: [
                    {
                        attachment: buffer,
                        name: "your data.txt",
                    },
                ],
            })
            .catch((e) => {
                console.log(e);
                fail = true;
            });
        if (fail) {
            embed.setDescription("could not dm you, enable your direct messages");
        } else {
            await addCooldown(cmd.name, message.member, 604800);
            embed.setDescription("check your direct messages");
        }
        await m.edit({ embeds: [embed] });
        await fs.unlink(file);
    }
}

cmd.setRun(run);

module.exports = cmd;
