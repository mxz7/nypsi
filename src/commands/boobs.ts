import { BaseGuildTextChannel, CommandInteraction, Message, ThreadChannel } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { redditImage } from "../utils/functions/image";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";

declare function require(name: string);

const cmd = new Command("boobs", "get a random boob image", Categories.NSFW).setAliases([
    "boobies",
    "tits",
    "titties",
    "booby",
    "boobie",
]);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    if (!message.channel.isTextBased()) return;

    if (message.channel.isDMBased()) return;

    if (message.channel.isThread())
        return message.channel.send({ embeds: [new ErrorEmbed("you must do this in an nsfw channel")] });

    if (!message.channel.nsfw) {
        return message.channel.send({ embeds: [new ErrorEmbed("you must do this in an nsfw channel")] });
    }

    const { images } = require("../utils/imghandler");

    const boobCache = images.get("boob");

    if (!boobCache) {
        return message.channel.send({ embeds: [new ErrorEmbed("please wait a couple more seconds..")] });
    }

    if (boobCache.size <= 2) {
        return message.channel.send({ embeds: [new ErrorEmbed("please wait a couple more seconds..")] });
    }

    await addCooldown(cmd.name, message.member, 7);

    const boobLinks = Array.from(boobCache.keys());

    const subredditChoice: any = boobLinks[Math.floor(Math.random() * boobLinks.length)];

    const allowed = boobCache.get(subredditChoice);

    const chosen = allowed[Math.floor(Math.random() * allowed.length)];

    const a = await redditImage(chosen, allowed);

    if (a == "lol") {
        return message.channel.send({ embeds: [new ErrorEmbed("unable to find boob image")] });
    }

    const image = a.split("|")[0];
    const title = a.split("|")[1];
    let url = a.split("|")[2];
    const author = a.split("|")[3];

    url = "https://reddit.com" + url;

    const subreddit = subredditChoice.split("/")[4];

    const embed = new CustomEmbed(message.member)
        .setTitle(title)
        .setHeader("u/" + author + " | r/" + subreddit)
        .setURL(url)
        .setImage(image);

    message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
