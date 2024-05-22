import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { getPrefix } from "../utils/functions/guilds/utils";
import PageManager from "../utils/functions/page";
import { getVersion } from "../utils/functions/version";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";
import dayjs = require("dayjs");

const cmd = new Command("minecraft", "view minecraft name history", "minecraft").setAliases(["mc"]);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const prefix = await getPrefix(message.guild);

  if (args.length == 0) {
    return message.channel.send({ embeds: [new ErrorEmbed(`${prefix}mc <account>`)] });
  }

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return message.channel.send({ embeds: [embed] });
  }

  await addCooldown(cmd.name, message.member, 4);

  const username = args[0];

  const uuid = await getUUID(args[0]);

  if (!uuid || uuid.id === "null") {
    return message.channel.send({ embeds: [new ErrorEmbed("invalid account")] });
  }

  const names = await getNameHistory(uuid.id);

  if (!names || names.length === 0) {
    return message.channel.send({
      embeds: [new ErrorEmbed("invalid data")],
    });
  }

  const pages = PageManager.createPages(
    names
      .reverse()
      .map(
        (i) => `\`${i.username}\`${i.changed_at ? ` | <t:${dayjs(i.changed_at).unix()}:d>` : ""}`,
      ),
    7,
  );

  const embed = new CustomEmbed(message.member)
    .setTitle(uuid.name)
    .setURL("https://namemc.com/profile/" + username)
    .setThumbnail(`https://mc-heads.net/avatar/${uuid.id}`)
    .setDescription(pages.get(1).join("\n"));

  if (pages.size === 1) return message.channel.send({ embeds: [embed] });

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("⬅")
      .setLabel("back")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder().setCustomId("➡").setLabel("next").setStyle(ButtonStyle.Primary),
  );

  const msg = await message.channel.send({ embeds: [embed], components: [row] });

  const manager = new PageManager({
    embed,
    message: msg,
    userId: message.author.id,
    row,
    pages,
    allowMessageDupe: true,
  });
  return manager.listen();
}

cmd.setRun(run);

module.exports = cmd;

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

async function getNameHistory(uuid: string): Promise<{ username: string; changed_at: string }[]> {
  if (await redis.exists(`${Constants.redis.cache.minecraft.NAME_HISTORY}:${uuid}`)) {
    return JSON.parse(await redis.get(`${Constants.redis.cache.minecraft.NAME_HISTORY}:${uuid}`));
  }

  const names: { username: string; changed_at: string }[] = await fetch(
    `https://laby.net/api/user/${uuid}/get-names`,
    {
      headers: {
        "User-Agent": `Mozilla/5.0 (compatible; nypsi/${getVersion()}; +https://github.com/mxz7)`,
      },
    },
  ).then((r) => r.json());

  // @ts-expect-error possible
  if (names.error) {
    logger.error(`minecraft name history fetch error`, names);
    return [];
  }

  await redis.set(
    `${Constants.redis.cache.minecraft.NAME_HISTORY}:${uuid}`,
    JSON.stringify(names),
    "EX",
    300,
  );

  return names;
}
