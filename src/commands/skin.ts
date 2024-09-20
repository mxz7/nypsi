import { CommandInteraction } from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { getPrefix } from "../utils/functions/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("skin", "view the skin of a minecraft account", "minecraft");

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}skin <account>`)] });
  }

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) message.channel.send({ embeds: [res.embed] });
    return;
  }

  await addCooldown(cmd.name, message.member, 10);

  const uuid = await getUUID(args[0]);

  if (!uuid || uuid.id === "null") {
    return message.channel.send({ embeds: [new ErrorEmbed("invalid account")] });
  }

  const embed = new CustomEmbed(
    message.member,
    `[download](https://mc-heads.net/download/${uuid.id})`,
  )
    .setTitle(uuid.name)
    .setURL("https://namemc.com/profile/" + args[0])
    .setImage(`https://visage.surgeplay.com/full/${uuid.id}`);

  return message.channel.send({ embeds: [embed] });
}

async function getUUID(username: string): Promise<{ name: string; id: string }> {
  if (await redis.exists(`${Constants.redis.cache.minecraft.UUID}:${username}`)) {
    return JSON.parse(await redis.get(`${Constants.redis.cache.minecraft.UUID}:${username}`));
  }

  let uuid = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`).then(
    (uuidURL) => uuidURL.json(),
  );

  if (uuid.errorMessage) uuid = { id: "null", string: "null" };

  await redis.set(
    `${Constants.redis.cache.minecraft.UUID}:${username}`,
    JSON.stringify(uuid),
    "EX",
    604800,
  );

  return uuid;
}

cmd.setRun(run);

module.exports = cmd;
