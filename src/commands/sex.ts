import { CommandInteraction, InteractionReplyOptions, Message, MessageOptions } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler.js";
import redis from "../utils/database/redis.js";
import { getDMsEnabled } from "../utils/economy/utils.js";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";
import { MilfSearchData } from "../utils/models/Sex.js";

const cmd = new Command("sex", "find horny milfs in ur area 😏", Categories.FUN).setAliases([
    "findhornymilfsinmyarea",
    "milffinder",
    "findamilf",
    "letsfuck",
]);

cmd.slashEnabled = true;
cmd.slashData.addStringOption((option) => option.setName("message").setDescription("a good pickup line always works (;"));

const looking = new Map<string, MilfSearchData>();

const descFilter = ["nigger", "nigga", "faggot", "fag", "nig", "ugly", "discordgg", "discordcom", "discordappcom"];

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
    const send = async (data: MessageOptions) => {
        if (!(message instanceof Message)) {
            if (message.deferred) {
                await message.editReply(data);
            } else {
                await message.reply(data as InteractionReplyOptions);
            }
            const replyMsg = await message.fetchReply();
            if (replyMsg instanceof Message) {
                return replyMsg;
            }
        } else {
            return await message.channel.send(data);
        }
    };

    if (!(message instanceof Message)) {
        await message.deferReply();
    }

    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return send({ embeds: [embed] });
    }

    if ((await redis.exists(`cd:sex-chastity:${message.author.id}`)) == 1) {
        const init = parseInt(await redis.get(`cd:sex-chastity:${message.author.id}`));
        const curr = new Date();
        const diff = Math.round((curr.getTime() - init) / 1000);
        const time = 10800 - diff;

        const minutes = Math.floor(time / 60);
        const seconds = time - minutes * 60;

        let remaining: string;

        if (minutes != 0) {
            remaining = `${minutes}m${seconds}s`;
        } else {
            remaining = `${seconds}s`;
        }

        return send({
            embeds: [
                new ErrorEmbed(`you have been equipped with a *chastity cage*, it will be removed in **${remaining}**`),
            ],
        });
    }

    await addCooldown(cmd.name, message.member, 45);

    const addToLooking = (description: string) => {
        const obj = {
            user: message.author,
            guild: message.guild,
            channel: message.channel.id,
            description: description,
            date: new Date().getTime(),
        };

        looking.set(message.author.id, obj);
    };

    let description = "";

    if (args.length > 0) {
        description = args.join(" ");
        const descriptionCheck = description.replace(/[^A-z0-9\s]/g, "");

        for (const word of descFilter) {
            if (descriptionCheck.includes(word)) {
                description = "";
                break;
            }
        }
        if (description.length > 50) {
            description = description.substr(0, 50) + "...";
        }
    }

    if (looking.size == 0) {
        addToLooking(description);
        return send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    "you're now on the milf waiting list 😏\n\nyou'll be notified when a match is found"
                ).setHeader("milf finder"),
            ],
        });
    } else {
        if (looking.has(message.author.id)) {
            return send({
                embeds: [new ErrorEmbed("we're already searching for a match.. calm down you horny shit")],
            });
        }

        for (const k of looking.keys()) {
            const key = looking.get(k);

            if (message.guild.id == key.guild.id) continue;

            looking.delete(key.user.id);

            const embed = new CustomEmbed(
                message.member,
                `a match has been made from **${key.guild.name}**\n\n` +
                    `go ahead and send **${key.user.tag}** a *private* message 😉😏`
            ).setHeader("milf finder");

            if (key.description != "") {
                embed.setDescription(
                    `a match has been made from **${key.guild.name}**\n\n` +
                        `**${key.user.tag}** - ${key.description}\n\n` +
                        "go ahead and send them a *private* message 😉😏"
                );
            }

            await send({ embeds: [embed] });

            const channel = key.guild.channels.cache.find((ch) => ch.id == key.channel);

            if (!channel.isTextBased()) return;

            const embed2 = new CustomEmbed(
                undefined,
                `a match has been made from **${message.guild.name}**\n\ngo ahead and send **${message.author.tag}** a *private* message 😉😏`
            )
                .setHeader("milf finder")
                .setColor("#5efb8f");

            if (description != "") {
                embed2.setDescription(
                    `a match has been made from **${message.guild.name}**\n\n` +
                        `**${message.author.tag}** - ${description}\n\n` +
                        "go ahead and send them a *private* message 😉😏"
                );
            }

            return await channel
                .send({ content: key.user.toString() + " a match has been found", embeds: [embed2] })
                .catch(() => {});
        }

        addToLooking(description);
        return send({
            embeds: [
                new CustomEmbed(
                    message.member,
                    "you're now on the milf waiting list 😏\n\nyou'll be notified when a match is found"
                ).setHeader("milf finder"),
            ],
        });
    }
}

cmd.setRun(run);

module.exports = cmd;

setInterval(() => {
    if (looking.size == 0) return;

    const now = new Date().getTime();

    const expire = 10800000;

    looking.forEach(async (obj) => {
        if (now - obj.date >= expire) {
            if (await getDMsEnabled(obj.user.id)) {
                await obj.user
                    .send({
                        embeds: [
                            new CustomEmbed(undefined, "unfortunately we couldn't find you a milf 😢")
                                .setColor("#e4334f")
                                .setHeader("milf finder"),
                        ],
                    })
                    .catch(() => {});
            }

            looking.delete(obj.user.id);
        }
    });
}, 600000);
