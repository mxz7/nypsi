import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { startGTFGame } from "../utils/functions/gtf/game";
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
    return startGTFGame(message);
  }
}

cmd.setRun(run);

module.exports = cmd;
