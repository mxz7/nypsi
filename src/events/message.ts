import { Collection, GuildMember, Message, PermissionsBitField, ThreadMember, ThreadMemberManager } from "discord.js";
import { runCommand } from "../utils/commandhandler";
import { userExists } from "../utils/economy/utils";
import { addCooldown, getChatFilter, getPrefix, hasGuild, inCooldown } from "../utils/guilds/utils";
import { logger } from "../utils/logger";
import { CustomEmbed } from "../utils/models/EmbedBuilders";
import { getTier, isPremium } from "../utils/premium/utils";
import doCollection from "../utils/workers/mentions";
import { cpu } from "node-os-utils";
import { getKarma, getLastCommand } from "../utils/karma/utils";
import ms = require("ms");
import { encrypt } from "../utils/functions/string";
import { addModLog } from "../utils/moderation/utils";
import { PunishmentType } from "../utils/models/GuildStorage";
import { deleteQueue, mentionQueue, MentionQueueItem } from "../utils/users/utils";
import Database = require("better-sqlite3");

// declare function require(name: string)

const db = new Database("./out/data/storage.db", { fileMustExist: true, timeout: 15000 });
const addMentionToDatabase = db.prepare(
    "INSERT INTO mentions (guild_id, target_id, date, user_tag, url, content) VALUES (?, ?, ?, ?, ?, ?)"
);
const fetchMentions = db.prepare("SELECT url FROM mentions WHERE guild_id = ? AND target_id = ? ORDER BY date DESC");
const deleteMention = db.prepare("DELETE FROM mentions WHERE url = ?");
let mentionInterval;
let workerCount = 0;

/**
 * @param {Message} message
 */
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

async function addMention() {
    let mention: MentionQueueItem | string;

    if (mentionQueue.length == 0) {
        if (deleteQueue.length == 0) {
            clearInterval(mentionInterval);
            mentionInterval = undefined;
            currentInterval = 150;
        } else {
            mention = deleteQueue.shift();
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
            if (workerCount >= 5) {
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

        addMentionToDatabase.run(guild, target, Math.floor(data.date / 1000), data.user, data.link, content);

        const mentions = fetchMentions.all(guild, target);

        let limit = 6;

        if (await isPremium(target)) {
            const tier = await getTier(target);

            limit += tier * 2;
        }

        if (mentions.length > limit) {
            mentions.splice(0, limit);

            for (const m of mentions) {
                if (deleteQueue.indexOf(m.url) != -1) return;
                deleteQueue.push(m.url);
            }
        }
    } else {
        deleteMention.run(mention);

        for (let i = 0; i < 49; i++) {
            mention = deleteQueue.shift();

            if (!mention) break;

            deleteMention.run(mention);
        }
    }

    if (mentionQueue.length == 0 && deleteQueue.length == 0) {
        clearInterval(mentionInterval);
        mentionInterval = undefined;
        currentInterval = 150;
    }

    const cpuUsage = await cpu.usage();

    const old = currentInterval;

    if (cpuUsage > 90) {
        currentInterval = 700;
    } else if (cpuUsage > 80) {
        currentInterval = 450;
    } else if (cpuUsage < 80) {
        currentInterval = 125;
    } else {
        currentInterval = 125;
    }

    if (currentInterval != old) {
        if (Date.now() - lastChange < 5000) return;
        clearInterval(mentionInterval);
        mentionInterval = setInterval(async () => await addMention(), currentInterval);

        lastChange = Date.now();
    }

    /**
     * @type {Array<{ type: String, members: Collection, message: Message, guild: String }>}
     */
    exports.mentionQueue = mentionQueue;
}

function cleanMentions() {
    const limit = Math.floor((Date.now() - 86400000 * 3) / 1000); // 3 days

    const { changes } = db.prepare("DELETE FROM mentions WHERE date < ?").run(limit);

    if (changes > 0) logger.info(`${changes} mentions deleted`);
}

setInterval(cleanMentions, 3600 * 1000);

export { workerCount };
