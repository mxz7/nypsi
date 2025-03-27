import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageEditOptions,
} from "discord.js";
import redis from "../../../../init/redis";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import Constants from "../../../Constants";
import { getMember } from "../../member";
import sleep from "../../sleep";
import { getInventory, setInventoryItem } from "../inventory";
import { isPassive } from "../passive";

module.exports = new ItemUse(
  "radio",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    args: string[],
  ) => {
    const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
      if (!(message instanceof Message)) {
        if (message.deferred) {
          await message.editReply(data as InteractionEditReplyOptions);
        } else {
          await message.reply(data as InteractionReplyOptions);
        }
        const replyMsg = await message.fetchReply();
        if (replyMsg instanceof Message) {
          return replyMsg;
        }
      } else {
        return await message.channel.send(data as BaseMessageOptions);
      }
    };

    const edit = async (data: MessageEditOptions, msg: Message) => {
      if (!(message instanceof Message)) {
        await message.editReply(data as InteractionEditReplyOptions);
        return await message.fetchReply();
      } else {
        return await msg.edit(data);
      }
    };

    if (args.length == 1) {
      return send({
        embeds: [new ErrorEmbed("/use radio <member>")],
      });
    }

    const radioTarget = await getMember(message.guild, args[1]);

    if (!radioTarget) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (message.member == radioTarget) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (await isPassive(radioTarget))
      return send({
        embeds: [new ErrorEmbed(`${radioTarget.toString()} is currently in passive mode`)],
      });

    if (await isPassive(message.member))
      return send({ embeds: [new ErrorEmbed("you are currently in passive mode")] });

    if ((await redis.exists(`${Constants.redis.cooldown.ROB_RADIO}:${radioTarget.user.id}`)) == 1) {
      return send({
        embeds: [
          new ErrorEmbed(`the police are already looking for **${radioTarget.user.username}**`),
        ],
      });
    }

    await redis.set(
      `${Constants.redis.cooldown.ROB_RADIO}:${radioTarget.user.id}`,
      Date.now(),
      "EX",
      900,
    );

    const inventory = await getInventory(message.member);

    await setInventoryItem(
      message.member,
      "radio",
      inventory.find((i) => i.item == "radio").amount - 1,
    );

    const msg = await send({
      embeds: [new CustomEmbed(message.member, "putting report out on police scanner...")],
    });

    await sleep(2000);

    return edit(
      {
        embeds: [
          new CustomEmbed(
            message.member,
            `putting report out on police scanner...\n\nthe police are now looking for **${radioTarget.user.username}**`,
          ),
        ],
      },
      msg,
    );
  },
);
