import { CommandInteraction, Message } from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { addProgress } from "../utils/functions/economy/achievements";
import { redditImage } from "../utils/functions/image";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { images } from "../utils/handlers/imghandler";

const cmd = new Command("cat", "get a random picture of a cat", "animals").setAliases(["kitty"]);

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  const catCache = images.get("cat");

  if (!catCache) {
    return message.channel.send({ embeds: [new ErrorEmbed("please wait a couple more seconds..")] });
  }

  if (catCache.size < 1) {
    return message.channel.send({ embeds: [new ErrorEmbed("please wait a couple more seconds..")] });
  }

  await addCooldown(cmd.name, message.member, 7);

  const catLinks = Array.from(catCache.keys());

  const subredditChoice = catLinks[Math.floor(Math.random() * catLinks.length)];

  const allowed = catCache.get(subredditChoice);

  const chosen = allowed[Math.floor(Math.random() * allowed.length)];

  const a = await redditImage(chosen, allowed);

  if (a == "lol") {
    return message.channel.send({ embeds: [new ErrorEmbed("unable to find cat image")] });
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

  addProgress(message.author.id, "cute", 1);
}

cmd.setRun(run);

module.exports = cmd;
