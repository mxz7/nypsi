import { Mention } from "@prisma/client";
import { Collection, GuildMember, Message, PermissionsBitField, ThreadMember, ThreadMemberManager } from "discord.js";
import { cpu } from "node-os-utils";
import { runCommand } from "../utils/commandhandler";
import prisma from "../utils/database/database";
import { userExists } from "../utils/economy/utils";
import { encrypt } from "../utils/functions/string";
import { addCooldown, getChatFilter, getPrefix, hasGuild, inCooldown } from "../utils/guilds/utils";
import { getKarma, getLastCommand } from "../utils/karma/utils";
import { logger } from "../utils/logger";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import { PunishmentType } from "../utils/models/GuildStorage";
import { addModLog } from "../utils/moderation/utils";
import { isPremium } from "../utils/premium/utils";
import { mentionQueue, MentionQueueItem } from "../utils/users/utils";
import doCollection from "../utils/workers/mentions";
import ms = require("ms");

let mentionInterval: NodeJS.Timer;

export default async function messageCreate(message: Message) {
    if (message.author.bot) return;
    if (!message.member) return;

    if (message.channel.isDMBased()) {
        logger.info("message in DM from " + message.author.tag + ": " + message.content);

        const embed = new CustomEmbed()
            .setHeader("nypsi")
            .setColor("#36393f")
            .setDescription(
                "unfortunately you can't do commands in direct messages ):\n\n" +
                    "if you need support or help for nypsi, please join the official nypsi server: https://discord.gg/hJTDNST"
            );
        return await message.channel.send({ embeds: [embed] });
    }

    message.content = message.content.replace(/ +(?= )/g, ""); // remove any additional spaces

    let prefix = await getPrefix(message.guild);

    if (message.client.user.id == "685193083570094101") prefix = "£";

    if (message.content == `<@!${message.client.user.id}>` || message.content == `<@${message.client.user.id}>`) {
        return message.channel.send({ content: `my prefix for this server is \`${prefix}\`` }).catch(() => {
            return message.member.send({
                content: `my prefix for this server is \`${prefix}\` -- i do not have permission to send messages in that channel`,
            });
        });
    }

    if ((await hasGuild(message.guild)) && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        const filter = await getChatFilter(message.guild);

        let content: string | string[] = message.content.toLowerCase().normalize("NFD");

        content = content.replace(/[^A-z0-9\s]/g, "");

        content = content.split(" ");

        for (const word of filter) {
            if (content.indexOf(word.toLowerCase()) != -1) {
                addModLog(message.guild, PunishmentType.FILTER_VIOLATION, message.author.id, "nypsi", content.join(" "), -1);
                return await message.delete().catch(() => {});
            }
        }
    }

    if (message.content.startsWith(prefix)) {
        const args = message.content.substring(prefix.length).split(" ");

        const cmd = args[0].toLowerCase();

        runCommand(cmd, message, args);
    }

    setTimeout(async () => {
        if (
            message.guild.memberCount < 150000 &&
            ((await userExists(message.guild.ownerId)) ||
                (await isPremium(message.guild.ownerId)) ||
                (await getKarma(message.guild.ownerId)) >= 50 ||
                (await getLastCommand(message.guild.ownerId)).getTime() >= Date.now() - ms("1 days"))
        ) {
            if (message.mentions.everyone) {
                if (!inCooldown(message.guild) && message.guild.members.cache.size != message.guild.memberCount) {
                    await message.guild.members.fetch();
                    addCooldown(message.guild, 3600);
                }

                // @ts-expect-error TYPESCRIPT STUPID IT WILL NOT BE DMCHANNEL
                let members: Collection<string, GuildMember | ThreadMember> | ThreadMemberManager = message.channel.members;

                if (members instanceof ThreadMemberManager) {
                    members = members.cache;
                }

                mentionQueue.push({
                    type: "collection",
                    members: members.clone(),
                    message: message,
                    // @ts-expect-error TYPESCRIPT STUPID IT WILL NOT BE DMCHANNEL
                    channelMembers: message.channel.members,
                    guildId: message.guild.id,
                    url: message.url,
                });

                if (!mentionInterval) {
                    mentionInterval = setInterval(async () => await addMention(), 150);
                }
            } else {
                if (message.mentions.roles.first()) {
                    if (!inCooldown(message.guild) && message.guild.members.cache.size != message.guild.memberCount) {
                        await message.guild.members.fetch();
                        addCooldown(message.guild, 3600);
                    }

                    let members: Collection<string, GuildMember | ThreadMember> | ThreadMemberManager =
                        // @ts-expect-error TYPESCRIPT STUPID IT WILL NOT BE DMCHANNEL
                        message.channel.members;

                    if (members instanceof ThreadMemberManager) {
                        members = members.cache;
                    }

                    message.mentions.roles.forEach((r) => {
                        mentionQueue.push({
                            type: "collection",
                            members: r.members.clone(),
                            message: message,
                            channelMembers: members,
                            guildId: message.guild.id,
                            url: message.url,
                        });
                    });

                    if (!mentionInterval) {
                        mentionInterval = setInterval(async () => await addMention(), 150);
                    }
                }

                if (message.mentions.members.first()) {
                    if (message.mentions.members.size == 1) {
                        if (message.mentions.members.first().user.id == message.author.id) return;
                        let content = message.content;

                        if (content.length > 100) {
                            content = content.substr(0, 97) + "...";
                        }

                        content = content.replace(/(\r\n|\n|\r)/gm, " ");

                        mentionQueue.push({
                            type: "mention",
                            data: {
                                user: message.author.tag,
                                content: content,
                                date: message.createdTimestamp,
                                link: message.url,
                            },
                            guildId: message.guild.id,
                            target: message.mentions.members.first().user.id,
                        });
                    } else {
                        mentionQueue.push({
                            type: "collection",
                            members: message.mentions.members.clone(),
                            message: message,
                            // @ts-expect-error TYPESCRIPT STUPID IT WILL NOT BE DMCHANNEL
                            channelMembers: message.channel.members,
                            guildId: message.guild.id,
                            url: message.url,
                        });
                    }

                    if (!mentionInterval) {
                        mentionInterval = setInterval(async () => await addMention(), 150);
                    }
                }
            }
        }
    }, 1000);
}

let currentInterval = 150;
let lastChange = 0;
let currentData: Mention[] = [];
let workerCount = 0;
let inserting = false;

async function addMention() {
    if (inserting) return;
    let mention: MentionQueueItem | string;

    if (currentData.length >= 500) {
        inserting = true;
        await prisma.mention.createMany({
            data: currentData,
            skipDuplicates: true,
        });
        currentData = [];
        inserting = false;
    }

    if (mentionQueue.length == 0) {
        clearInterval(mentionInterval);
        mentionInterval = undefined;
        currentInterval = 150;

        if (currentData.length > 0) {
            inserting = true;
            await prisma.mention.createMany({
                data: currentData,
                skipDuplicates: true,
            });
            currentData = [];
            inserting = false;
        }
    } else {
        mention = mentionQueue.shift();
    }

    if (!mention) {
        clearInterval(mentionInterval);
        mentionInterval = undefined;
        return;
    }

    if (typeof mention != "string" && mention.type == "collection") {
        const members = mention.members;

        if (members.size > 1000) {
            if (workerCount >= 4) {
                mentionQueue.push(mention);
                return;
            }
            workerCount++;
            logger.debug(`${members.size.toLocaleString()} mentions being inserted with worker.. (${workerCount})`);
            const start = Date.now();
            const res = await doCollection(mention).catch((e) => {
                logger.error("error inserting mentions with worker");
                console.error(e);
            });
            workerCount--;

            if (res == 0) {
                logger.debug(`${members.size.toLocaleString()} mentions inserted in ${(Date.now() - start) / 1000}s`);
            } else {
                logger.warn("worker timed out");
                logger.debug(`${members.size.toLocaleString()} mentions inserted in ${(Date.now() - start) / 1000}s`);
            }

            return;
        }

        let content = mention.message.content;

        if (content.length > 100) {
            content = content.substr(0, 97) + "...";
        }

        content = content.replace(/(\r\n|\n|\r)/gm, " ");

        let count = 0;

        let channelMembers = mention.channelMembers;

        for (const memberID of Array.from(members.keys())) {
            if (count >= 50) {
                return mentionQueue.push({
                    type: "collection",
                    members: members.clone(),
                    message: mention.message,
                    channelMembers: channelMembers,
                    guildId: mention.guildId,
                });
            }
            const member = members.get(memberID);

            members.delete(memberID);

            if (member.user.bot) continue;
            if (member.user.id == mention.message.author.id) continue;

            try {
                if (!channelMembers.has(memberID)) continue;
            } catch {
                channelMembers = channelMembers.cache;
                if (!channelMembers.has(memberID)) continue;
            }

            const data = {
                user: mention.message.author.tag,
                content: content,
                date: mention.message.createdTimestamp,
                link: mention.message.url,
            };

            const guild = mention.message.guild.id;

            mentionQueue.push({
                type: "mention",
                data: data,
                guildId: guild,
                target: member.user.id,
            });
            count++;
        }
    } else if (typeof mention != "string" && mention.type == "mention") {
        const guild = mention.guildId;
        const data = mention.data;
        const target = mention.target;

        const content: string = encrypt(data.content);

        currentData.push({
            guildId: guild,
            content: content,
            url: data.link,
            date: new Date(data.date),
            targetId: target,
            userTag: data.user,
        });
    }

    if (mentionQueue.length == 0) {
        clearInterval(mentionInterval);
        mentionInterval = undefined;
        currentInterval = 150;

        if (currentData.length > 0) {
            inserting = true;
            await prisma.mention.createMany({
                data: currentData,
                skipDuplicates: true,
            });
            currentData = [];
            inserting = false;
        }
    }

    const cpuUsage = await cpu.usage();

    const old = currentInterval;

    if (cpuUsage > 90) {
        currentInterval = 1000;
    } else if (cpuUsage > 80) {
        currentInterval = 500;
    } else if (cpuUsage < 80) {
        currentInterval = 300;
    } else {
        currentInterval = 125;
    }

    if (currentInterval != old) {
        if (Date.now() - lastChange < 5000) return;
        clearInterval(mentionInterval);
        mentionInterval = setInterval(async () => await addMention(), currentInterval);

        lastChange = Date.now();
    }

    exports.mentionQueue = mentionQueue;
}

export { workerCount };
