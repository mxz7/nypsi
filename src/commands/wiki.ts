import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { Command, NypsiCommandInteraction, NypsiMessage } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";

const cmd = new Command(
  "wiki",
  "get the link to the nypsi wiki / documentation",
  "info",
).setAliases(["docs"]);

cmd.slashEnabled = true;

async function run(message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) {
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

  const embed = new CustomEmbed(
    message.member,
    "https://nypsi.xyz/docs?ref=bot-wiki\n\n" +
      "nypsi documentation / wiki is fully open source, meaning you can contribute and add to it! it may not be in the best shape right now and have all of the information, but it's always being improved and kept up to date",
  ).setHeader("nypsi documentation", message.author.avatarURL());

  return send({ embeds: [embed] });
}

cmd.setRun(run);

module.exports = cmd;
