import { CommandInteraction, Message } from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { RedditJSONPost } from "../types/Reddit";
import { addProgress } from "../utils/functions/economy/achievements";
import { redditImage } from "../utils/functions/image";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("dog", "get a random picture of a dog", "animals");

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  const posts = await redis
    .lrange("nypsi:images:dog", 0, -1)
    .then((i) => i.map((j) => JSON.parse(j) as RedditJSONPost));

  if (posts.length < 10) {
    return message.channel.send({
      embeds: [new ErrorEmbed("please wait a couple more seconds..")],
    });
  }

  await addCooldown(cmd.name, message.member, 7);

  const chosen = posts[Math.floor(Math.random() * posts.length)];

  const a = await redditImage(chosen, posts);

  if (a == "lol") {
    return message.channel.send({ embeds: [new ErrorEmbed("unable to find thighs image")] });
  }

  const image = a.split("|")[0];
  const title = a.split("|")[1];
  let url = a.split("|")[2];
  const author = a.split("|")[3];

  url = "https://reddit.com" + url;

  const embed = new CustomEmbed(message.member)
    .setTitle(title)
    .setHeader("u/" + author + " | r/" + chosen.data.subreddit)
    .setURL(url)
    .setImage(image);

  message.channel.send({ embeds: [embed] });

  addProgress(message.author.id, "cute", 1);
}

cmd.setRun(run);

module.exports = cmd;
