import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { NypsiCommandInteraction } from "../../../../models/Command";
import { CustomEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";

const responses = [
  "AHHHH DONT EAT ME PLSSS",
  "meow",
  "meow meow",
  "meow meow meow",
  "meow meow meow meow",
  "meow meow meow meow meow",
  "meow meow meow meow meow meow",
  "meow meow meow meow meow meow meow meow meow meow meow meow meow meow meow meow",
  "img:https://i.imgur.com/eAA9L8C.jpeg",
  "img:https://i.imgur.com/lI3nx6w.jpeg",
  "img:https://i.imgur.com/oLnhaaa.jpeg",
  "img:https://i.imgur.com/cxpzxEL.jpeg",
  "img:https://i.imgur.com/GfrwBpV.jpeg",
  "img:https://i.imgur.com/BzOORPo.jpeg",
  "img:https://i.imgur.com/0ae95g5.jpeg",
  "img:https://i.imgur.com/RfSFeIM.jpeg",
  "img:https://i.imgur.com/f5XVEdt.jpeg",
  "img:https://animalscdn.maxz.dev/cat/3gUaxje",
  "img:https://animalscdn.maxz.dev/cat/Ufn2wnis",
];

module.exports = new ItemUse(
  "dave",
  async (message: Message | (NypsiCommandInteraction & CommandInteraction)) => {
    const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
      if (!(message instanceof Message)) {
        let usedNewMessage = false;
        let res;

        if (message.deferred) {
          res = await message.editReply(data).catch(async () => {
            usedNewMessage = true;
            return await message.channel.send(data as BaseMessageOptions);
          });
        } else {
          res = await message.reply(data as InteractionReplyOptions).catch(() => {
            return message.editReply(data).catch(async () => {
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

    const chosen = responses[Math.floor(Math.random() * responses.length)];

    const embed = new CustomEmbed(message.member);

    if (chosen.startsWith("img:")) embed.setImage(chosen.substring(4, chosen.length));
    else embed.setDescription(chosen);

    return send({
      embeds: [embed],
    });
  },
);
