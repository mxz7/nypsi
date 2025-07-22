import { Client } from "@zeyrbot/urbandictionary";
import { CommandInteraction } from "discord.js";
import { inPlaceSort } from "fast-sort";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import { getPrefix } from "../utils/functions/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("urban", "get a definition from urban dictionary", "info").setAliases([
  "define",
]);

const urban = new Client();

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed] });
    return;
  }

  const prefix = (await getPrefix(message.guild))[0];

  if (args.length == 0) {
    return send({ embeds: [new ErrorEmbed(`${prefix}urban <definition>`)] });
  }

  await addCooldown(cmd.name, message.member, 10);

  let fail = false;

  const results = await urban.define(args.join()).catch(() => {
    fail = true;
  });

  if (fail) return send({ embeds: [new ErrorEmbed("unknown definition")] });

  if (!results) {
    return send({ embeds: [new ErrorEmbed("unknown definition")] });
  }

  inPlaceSort(results.list).desc((i: any) => i.thumbs_up);

  const result = results.list[0];

  if (!result) return send({ embeds: [new ErrorEmbed("unknown definition")] });
  if (!result.word) return send({ embeds: [new ErrorEmbed("unknown definition")] });

  const embed = new CustomEmbed(message.member, result.definition + "\n\n" + result.example)
    .setTitle(result.word)
    .setHeader("published by " + result.author)
    .addField("👍", result.thumbs_up.toLocaleString(), true)
    .addField("👎", result.thumbs_down.toLocaleString(), true)
    .setURL(result.permalink);

  return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
