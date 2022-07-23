import { WholesomeSuggestion } from "@prisma/client";
import { CommandInteraction, InteractionReplyOptions, Message, MessageOptions, MessageReaction, User } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { formatDate } from "../utils/functions/date";
import {
    acceptWholesomeImage,
    clearWholesomeCache,
    deleteFromWholesome,
    denyWholesomeImage,
    getAllSuggestions,
    getWholesomeImage,
    isImageUrl,
    suggestWholesomeImage,
    uploadImageToImgur,
} from "../utils/functions/image";
import { getMember } from "../utils/functions/member";
import { getPrefix } from "../utils/guilds/utils";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders.js";

const uploadCooldown = new Map<string, number>();

const cmd = new Command("wholesome", "get a random wholesome picture", Categories.FUN).setAliases([
    "iloveyou",
    "loveu",
    "ws",
    "ily",
]);

cmd.slashEnabled = true;

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

    const prefix = await getPrefix(message.guild);

    const embed = new CustomEmbed(message.member);

    let target;

    if (args.length == 0 || !(message instanceof Message)) {
        const image = await getWholesomeImage();

        embed.setHeader(`<3 | #${image.id}`);
        embed.setImage(image.image);
    } else if (args[0].toLowerCase() == "add" || args[0].toLowerCase() == "suggest" || args[0].toLowerCase() == "+") {
        if (uploadCooldown.has(message.member.id)) {
            const init = uploadCooldown.get(message.member.id);
            const curr = new Date();
            const diff = Math.round((curr.getTime() - init) / 1000);
            const time = 60 - diff;

            const minutes = Math.floor(time / 60);
            const seconds = time - minutes * 60;

            let remaining: string;

            if (minutes != 0) {
                remaining = `${minutes}m${seconds}s`;
            } else {
                remaining = `${seconds}s`;
            }

            return send({
                embeds: [new ErrorEmbed(`you are on upload cooldown for \`${remaining}\``)],
            });
        }

        if (args.length == 1 && !message.attachments.first()) {
            return send({
                embeds: [new ErrorEmbed(`${prefix}wholesome suggest <imgur url>`)],
            });
        }

        let url = args[1];

        if (message.attachments.first()) {
            url = message.attachments.first().url;
        }

        if (!url.toLowerCase().startsWith("https")) {
            return send({ embeds: [new ErrorEmbed("must be http**s**")] });
        }

        if (!url.toLowerCase().startsWith("https://i.imgur.com/")) {
            if (!isImageUrl(url)) {
                return send({
                    embeds: [
                        new ErrorEmbed(
                            "must be an image hosted on https://imgur.com\n\ntutorial: https://youtu.be/xaRu40hawUE"
                        ),
                    ],
                });
            }

            const upload = await uploadImageToImgur(url);

            if (!upload) {
                return send({
                    embeds: [
                        new ErrorEmbed(
                            "must be an image hosted on https://imgur.com\n\ntutorial: https://youtu.be/xaRu40hawUE"
                        ),
                    ],
                });
            } else {
                uploadCooldown.set(message.member.id, new Date().getTime());

                setTimeout(() => {
                    uploadCooldown.delete(message.author.id);
                }, 60 * 1000);
                url = upload;
            }
        }

        const res = await suggestWholesomeImage(message.member, url);

        if (!res) {
            return send({
                embeds: [
                    new ErrorEmbed(
                        `error: maybe that image already exists? if this persists join the ${prefix}support server`
                    ),
                ],
            });
        }

        await addCooldown(cmd.name, message.member, 15);

        return message.react("✅");
    } else if (args[0].toLowerCase() == "get") {
        if (args.length == 1) {
            return send({ embeds: [new ErrorEmbed("dumbass")] });
        }

        const wholesome = await getWholesomeImage(parseInt(args[1]));

        if (!wholesome) {
            return message.react("❌");
        }

        embed.setHeader(`image #${wholesome.id}`);

        if (message.author.id == "672793821850894347") {
            embed.setDescription(
                `**suggested by** ${wholesome.submitter} (${wholesome.submitterId})\n**accepted by** \`${wholesome.accepterId}\`\n**url** ${wholesome.image}`
            );
        }

        embed.setImage(wholesome.image);
        embed.setFooter({ text: `submitted on ${formatDate(wholesome.uploadDate)}` });
    } else if (args[0].toLowerCase() == "accept" || args[0].toLowerCase() == "a") {
        if (message.guild.id != "747056029795221513") return;

        const roles = message.member.roles.cache;

        let allow = false;

        if (roles.has("747056620688900139")) allow = true;
        if (roles.has("747059949770768475")) allow = true;
        if (roles.has("845613231229370429")) allow = true;

        if (!allow) return;

        if (args.length == 1) {
            return send({ embeds: [new ErrorEmbed("you must include the suggestion id")] });
        }

        const res = await acceptWholesomeImage(parseInt(args[1]), message.member);

        if (!res) {
            return send({
                embeds: [new ErrorEmbed(`couldnt find a suggestion with id \`${args[1]}\``)],
            });
        }

        return message.react("✅");
    } else if (args[0].toLowerCase() == "deny" || args[0].toLowerCase() == "d") {
        if (message.guild.id != "747056029795221513") return;

        const roles = message.member.roles.cache;

        let allow = false;

        if (roles.has("747056620688900139")) allow = true;
        if (roles.has("747059949770768475")) allow = true;
        if (roles.has("845613231229370429")) allow = true;

        if (!allow) return;

        if (args.length == 1) {
            return send({ embeds: [new ErrorEmbed("you must include the suggestion id")] });
        }

        const res = await denyWholesomeImage(parseInt(args[1]));

        if (!res) {
            return send({
                embeds: [new ErrorEmbed(`couldnt find a suggestion with id \`${args[1]}\``)],
            });
        }

        return message.react("✅");
    } else if (args[0].toLowerCase() == "delete") {
        if (message.author.id != "672793821850894347") return;

        if (args.length == 1) {
            return send({ embeds: [new ErrorEmbed("dumbass")] });
        }

        const res = await deleteFromWholesome(parseInt(args[1]));

        if (!res) {
            return message.react("❌");
        }

        return message.react("✅");
    } else if (args[0].toLowerCase() == "reload") {
        if (message.author.id != "672793821850894347") return;

        clearWholesomeCache();

        return message.react("✅");
    } else if (args[0].toLowerCase() == "queue" || args[0].toLowerCase() == "q") {
        if (message.guild.id != "747056029795221513") return;

        const roles = message.member.roles.cache;

        let allow = false;

        if (roles.has("747056620688900139")) allow = true;
        if (roles.has("747059949770768475")) allow = true;
        if (roles.has("845613231229370429")) allow = true;

        if (!allow) return;

        const queue = await getAllSuggestions();

        const pages = new Map<number, WholesomeSuggestion[]>();

        if (queue.length > 6) {
            for (const image of queue) {
                if (pages.size == 0) {
                    pages.set(1, [image]);
                } else {
                    if (pages.get(pages.size).length >= 6) {
                        pages.set(pages.size + 1, [image]);
                    } else {
                        const current = pages.get(pages.size);
                        current.push(image);
                        pages.set(pages.size, current);
                    }
                }
            }
        }

        for (const image of queue) {
            if (embed.data.fields.length >= 6) break;

            embed.addField(
                image.id.toString(),
                `**suggested** ${image.submitter} (${image.submitterId})\n**url** ${image.image}`
            );
        }

        embed.setHeader("wholesome queue");

        if (queue.length == 0) {
            embed.setDescription("no wholesome suggestions");
        }

        if (pages.size != 0) {
            embed.setFooter({ text: `page 1/${pages.size}` });
        }

        const msg = await send({ embeds: [embed] });

        if (pages.size == 0) return;

        await msg.react("⬅");
        await msg.react("➡");

        let currentPage = 1;
        const lastPage = pages.size;

        const filter = (reaction: MessageReaction, user: User) => {
            return ["⬅", "➡"].includes(reaction.emoji.name) && user.id == message.member.user.id;
        };

        const pageManager = async (): Promise<void> => {
            const reaction = await msg
                .awaitReactions({ filter, max: 1, time: 30000, errors: ["time"] })
                .then((collected) => {
                    return collected.first().emoji.name;
                })
                .catch(async () => {
                    await msg.reactions.removeAll();
                });

            if (!reaction) return;

            const newEmbed = new CustomEmbed(message.member).setHeader("wholesome queue");

            if (reaction == "⬅") {
                if (currentPage <= 1) {
                    return pageManager();
                } else {
                    currentPage--;

                    for (const image of pages.get(currentPage)) {
                        newEmbed.addField(
                            image.id.toString(),
                            `**suggested** ${image.submitter} (${image.submitterId})\n**url** ${image.image})`
                        );
                    }

                    newEmbed.setFooter({ text: `page ${currentPage}/${lastPage}` });
                    await msg.edit({ embeds: [newEmbed] });
                    return pageManager();
                }
            } else if (reaction == "➡") {
                if (currentPage >= lastPage) {
                    return pageManager();
                } else {
                    currentPage++;

                    for (const image of pages.get(currentPage)) {
                        newEmbed.addField(
                            image.id.toString(),
                            `**suggested** ${image.submitter} (${image.submitterId})\n**url** ${image.image})`
                        );
                    }

                    newEmbed.setFooter({ text: `page ${currentPage}/${lastPage}` });
                    await msg.edit({ embeds: [newEmbed] });
                    return pageManager();
                }
            }
        };

        return pageManager();
    } else {
        let member;

        if (!message.mentions.members.first()) {
            member = await getMember(message.guild, args.join(" "));
        } else {
            member = message.mentions.members.first();
        }

        if (member) {
            target = member;
        } else {
            return send({ embeds: [new ErrorEmbed("couldnt find that member ):")] });
        }

        const image = await getWholesomeImage();

        embed.setHeader(`<3 | #${image.id}`);
        embed.setImage(image.image);
    }

    await addCooldown(cmd.name, message.member, 7);

    const chance = Math.floor(Math.random() * 25);

    if (chance == 7) embed.setFooter({ text: `submit your own image with ${prefix}wholesome suggest (:` });

    if (target) {
        if (message instanceof Message) {
            await message.delete();
        }
        return send({
            content: `${target.user.toString()} you've received a wholesome image (:`,
            embeds: [embed],
        });
    }

    return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
