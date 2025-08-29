import { CommandInteraction } from "discord.js";
import redis from "../init/redis";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants";
import { getPrefix } from "../utils/functions/guilds/utils";
import PageManager from "../utils/functions/page";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import dayjs = require("dayjs");

const cmd = new Command("minecraft", "view minecraft name history", "minecraft").setAliases(["mc"]);

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    return send({ embeds: [new ErrorEmbed(`${prefix}mc <account>`)] });
  }

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed] });
    return;
  }

  await addCooldown(cmd.name, message.member, 4);

  let username = args[0];

  const uuid = await getUUID(args[0]);

  if (!uuid || uuid.id === "null") {
    return send({ embeds: [new ErrorEmbed("invalid account")] });
  }

  const data = await getNameHistory(uuid.id);

  if (!data) {
    return send({ embeds: [new ErrorEmbed("invalid data")] });
  }

  if (typeof data === "string") {
    return send({ embeds: [new ErrorEmbed(data.toLowerCase())] });
  }

  if (data.name_history.length === 0) {
    return send({
      embeds: [new ErrorEmbed("invalid data")],
    });
  }

  username = data.name;

  const pages = PageManager.createPages(
    data.name_history
      .reverse()
      .map((i) => `\`${i.name}\`${i.changed_at ? ` | <t:${dayjs(i.changed_at).unix()}:d>` : ""}`),
    7,
  );

  const embed = new CustomEmbed(message.member)
    .setTitle(uuid.name)
    .setURL("https://namemc.com/profile/" + username)
    .setThumbnail(`https://mc-heads.net/avatar/${uuid.id}`)
    .setDescription(pages.get(1).join("\n"));

  if (pages.size === 1) return send({ embeds: [embed] });

  const row = PageManager.defaultRow();

  const msg = await send({ embeds: [embed], components: [row] });

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

  const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`);

  let uuid = await res.json().catch(() => ({ errorMessage: "meow" }));

  if (uuid.errorMessage) uuid = { id: "null", string: "null" };

  await redis.set(
    `${Constants.redis.cache.minecraft.UUID}:${username}`,
    JSON.stringify(uuid),
    "EX",
    604800,
  );

  return uuid;
}

async function getNameHistory(uuid: string): Promise<ApiResponse | string> {
  if (await redis.exists(`${Constants.redis.cache.minecraft.NAME_HISTORY}:${uuid}`)) {
    return JSON.parse(await redis.get(`${Constants.redis.cache.minecraft.NAME_HISTORY}:${uuid}`));
  }

  const data: ApiResponse & { error?: string } = await fetch(
    `https://laby.net/api/v3/user/${uuid}/profile`,
    {
      headers: {
        "User-Agent": `Mozilla/5.0 (compatible; nypsi}; +https://github.com/mxz7)`,
      },
    },
  ).then((r) => r.json());

  // @ts-expect-error possible
  if (names.error) {
    return data.error;
  }

  await redis.set(
    `${Constants.redis.cache.minecraft.NAME_HISTORY}:${uuid}`,
    JSON.stringify(data),
    "EX",
    86400,
  );

  return data;
}

type ApiResponse = {
  uuid: string;
  name: string;
  last_updated: string;
  name_history: { name: string; changed_at: string | null; accurate: boolean }[];
};
