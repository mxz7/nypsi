import { CommandInteraction, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { redditImage } from "../utils/functions/image";
import { images } from "../utils/imghandler";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("thighs", "get a random thighs image", Categories.NSFW);

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

    const thighsCache = images.get("thighs");

    if (!thighsCache) {
        return message.channel.send({ embeds: [new ErrorEmbed("please wait a couple more seconds..")] });
    }

    if (thighsCache.size <= 1) {
        return message.channel.send({ embeds: [new ErrorEmbed("please wait a couple more seconds..")] });
    }

    await addCooldown(cmd.name, message.member, 7);

    const thighsLinks = Array.from(thighsCache.keys());

    const subredditChoice = thighsLinks[Math.floor(Math.random() * thighsLinks.length)];

    const allowed = thighsCache.get(subredditChoice);

    const chosen = allowed[Math.floor(Math.random() * allowed.length)];

    const a = await redditImage(chosen, allowed);

    if (a == "lol") {
        return message.channel.send({ embeds: [new ErrorEmbed("unable to find thighs image")] });
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
