import { BaseGuildTextChannel, CommandInteraction, Message, ThreadChannel } from "discord.js";
import fetch from "node-fetch";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";
import { getPrefix } from "../utils/guilds/utils";
import { redditImage } from "../utils/functions/image";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";

const blacklisted = ["body", "shit"];

const cmd = new Command("reddit", "get a random image from any subreddit", Categories.UTILITY);

/**
 * @param {Message} message
 * @param {Array<String>} args
 */
async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: Array<string>) {
    if (await onCooldown(cmd.name, message.member)) {
        const embed = await getResponse(cmd.name, message.member);

        return message.channel.send({ embeds: [embed] });
    }

    const prefix = await getPrefix(message.guild);

    if (args.length == 0) {
        return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}reddit <subreddit>`)] });
    }

    if (!(message.channel instanceof BaseGuildTextChannel || message.channel.type == "GUILD_PUBLIC_THREAD")) return;

    for (const bannedSubReddit of blacklisted) {
        if (
            args[0].toLowerCase() == bannedSubReddit &&
            !(message.channel instanceof ThreadChannel) &&
            !message.channel.nsfw
        ) {
            return message.channel.send({
                embeds: [
                    new ErrorEmbed(
                        "this subreddit is known for nsfw content without using nsfw flairs, please use an nsfw channel"
                    ),
                ],
            });
        }
    }

    await addCooldown(cmd.name, message.member, 7);

    let allowed;

    try {
        const res = await fetch("https://www.reddit.com/r/" + args[0] + ".json?limit=100").then((a) => a.json());

        allowed = res.data.children.filter((post) => !post.data.is_self);
    } catch (e) {
        return message.channel.send({ embeds: [new ErrorEmbed("invalid subreddit")] });
    }

    const chosen = allowed[Math.floor(Math.random() * allowed.length)];

    if (!chosen) {
        return message.channel.send({ embeds: [new ErrorEmbed("unable to find image")] });
    }

    if (chosen.data.over_18 && !(message.channel instanceof ThreadChannel) && !message.channel.nsfw) {
        return message.channel.send({ embeds: [new ErrorEmbed("you must do this in an nsfw channel")] });
    }

    const a = await redditImage(chosen, allowed);

    const image = a.split("|")[0];
    const title = a.split("|")[1];
    let url = a.split("|")[2];
    const author = a.split("|")[3];

    url = "https://reddit.com" + url;

    if (image == "lol") {
        return message.channel.send({ embeds: [new ErrorEmbed("unable to find image")] });
    }

    const subreddit = args[0];

    const embed = new CustomEmbed(message.member)
        .setTitle(title)
        .setHeader("u/" + author + " | r/" + subreddit)
        .setURL(url)
        .setImage(image);

    message.channel.send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
