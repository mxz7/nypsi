import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
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
  "img:https://file.maxz.dev/XT6lUbETxJ.jpg",
  "img:https://file.maxz.dev/ZsuEygTbNQ.jpg",
  "img:https://file.maxz.dev/J297W2CFaw.webp",
  "img:https://file.maxz.dev/hnSsiUxbhW.jpg",
  "img:https://file.maxz.dev/ObdqjCUXgT.jpg",
  "img:https://file.maxz.dev/t63l3wjm40.jpg",
  "img:https://file.maxz.dev/SCSBCMxXPK.jpg",
  "img:https://file.maxz.dev/lyWI8uBDJq.jpg",
  "img:https://file.maxz.dev/JfUeBPZPBC.jpg",
  "img:https://file.maxz.dev/FIFtW0Ow9I.jpg",
];

module.exports = new ItemUse(
  "dave",
  async (message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction)) => {
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

    const chosen = responses[Math.floor(Math.random() * responses.length)];

    const embed = new CustomEmbed(message.member);

    if (chosen.startsWith("img:")) embed.setImage(chosen.substring(4, chosen.length));
    else embed.setDescription(chosen);

    return send({
      embeds: [embed],
    });
  },
);
