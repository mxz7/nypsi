import { CommandInteraction, Message } from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { addProgress } from "../utils/economy/achievements";
import { redditImage } from "../utils/functions/image";
import { images } from "../utils/imghandler";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders.js";

const cmd = new Command("rabbit", "get a random picture of a rabbit", Categories.ANIMALS).setAliases(["bunny"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  const rabbitCache = images.get("rabbit");

  if (!rabbitCache) {
    return message.channel.send({ embeds: [new ErrorEmbed("please wait a couple more seconds..")] });
  }

  if (rabbitCache.size < 1) {
    return message.channel.send({ embeds: [new ErrorEmbed("please wait a couple more seconds..")] });
  }

  await addCooldown(cmd.name, message.member, 7);

  const rabbitLinks = Array.from(rabbitCache.keys());

  const subredditChoice = rabbitLinks[Math.floor(Math.random() * rabbitLinks.length)];

  const allowed = rabbitCache.get(subredditChoice);

  const chosen = allowed[Math.floor(Math.random() * allowed.length)];

  const a = await redditImage(chosen, allowed);

  if (a == "lol") {
    return message.channel.send({ embeds: [new ErrorEmbed("unable to find rabbit image")] });
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

  await addProgress(message.author.id, "cute", 1);
}

cmd.setRun(run);

module.exports = cmd;
