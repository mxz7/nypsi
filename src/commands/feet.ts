import { CommandInteraction, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { redditImage } from "../utils/functions/image";
import { images } from "../utils/imghandler";
import { Command, Categories, NypsiCommandInteraction } from "../utils/models/Command";
import { ErrorEmbed, CustomEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("feet", "get a random foot image", Categories.NSFW).setAliases(["tootsies", "toes", "feets"]);

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

    const feetCache = images.get("feet");

    if (!feetCache) {
        return message.channel.send({ embeds: [new ErrorEmbed("please wait a couple more seconds..")] });
    }

    if (feetCache.size <= 2) {
        return message.channel.send({ embeds: [new ErrorEmbed("please wait a couple more seconds..")] });
    }

    await addCooldown(cmd.name, message.member, 7);

    const feetLinks = Array.from(feetCache.keys());

    const subredditChoice: any = feetLinks[Math.floor(Math.random() * feetLinks.length)];

    const allowed = feetCache.get(subredditChoice);

    const chosen = allowed[Math.floor(Math.random() * allowed.length)];

    const a = await redditImage(chosen, allowed);

    if (a == "lol") {
        return message.channel.send({ embeds: [new ErrorEmbed("unable to find feet image")] });
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
