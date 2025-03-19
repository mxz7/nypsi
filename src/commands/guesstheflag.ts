import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageFlags,
} from "discord.js";
import prisma from "../init/database";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { MStoTime } from "../utils/functions/date";
import { startGTFGame } from "../utils/functions/gtf/game";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import ms = require("ms");

const cmd = new Command("guesstheflag", "play a guess the flag game", "fun").setAliases([
  "gtf",
  "flag",
]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((option) => option.setName("play").setDescription("play a game of guess the flag"))
  .addSubcommand((option) =>
    option.setName("stats").setDescription("view your guess the flag stats"),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
  const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
    if (!(message instanceof Message)) {
      let usedNewMessage = false;
      let res;

      if (message.deferred) {
        res = await message.editReply(data as InteractionEditReplyOptions).catch(async () => {
          usedNewMessage = true;
          return await message.channel.send(data as BaseMessageOptions);
        });
      } else {
        res = await message.reply(data as InteractionReplyOptions).catch(() => {
          return message.editReply(data as InteractionEditReplyOptions).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        });
      }

      if (usedNewMessage && res instanceof Message) return res;

      const replyMsg = await message.fetchReply();
      if (replyMsg instanceof Message) {
        return replyMsg;
      }
    } else {
      return await message.channel.send(data as BaseMessageOptions);
    }
  };

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (args.length === 0) {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          "**/guesstheflag play** *play a game*\n" + "**/guesstheflag stats** *view your stats*",
        ).setHeader("guess the flag help", message.author.avatarURL()),
      ],
    });
  } else if (args[0].toLowerCase() === "play" || args[0].toLowerCase() === "p") {
    await addCooldown(cmd.name, message.member, 20);
    return startGTFGame(message);
  } else if (args[0].toLowerCase() === "stats") {
    await addCooldown(cmd.name, message.member, 20);
    const [quick, won, lost] = await Promise.all([
      prisma.flagGame.aggregate({
        _min: {
          time: true,
        },
        where: { won: true },
      }),
      prisma.flagGame.count({ where: { won: true } }),
      prisma.flagGame.count({ where: { won: false } }),
    ]);

    const embed = new CustomEmbed(
      message.member,
      `you have won ${won.toLocaleString()} games of ${(won + lost).toLocaleString()} total games (${((won / (won + lost)) * 100).toFixed(1)}%)\n\n` +
        `your fastest game was \`${MStoTime(quick._min.time)}s\``,
    ).setHeader(`${message.author.username}'s guess the flag stats`);

    return send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
