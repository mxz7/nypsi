import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message, MessageEditOptions } from "discord.js";
import redis from "../../../../init/redis";
import { NypsiCommandInteraction } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import Constants from "../../../Constants";
import { getDisabledCommands } from "../../guilds/disabledcommands";
import { getMember } from "../../member";
import sleep from "../../sleep";
import { getDmSettings } from "../../users/notifications";
import { hasPadlock, setPadlock } from "../balance";
import { getInventory, setInventoryItem } from "../inventory";

module.exports = new ItemUse(
  "lock_pick",
  async (message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) => {
    const send = async (data: BaseMessageOptions | InteractionReplyOptions) => {
      if (!(message instanceof Message)) {
        if (message.deferred) {
          await message.editReply(data);
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
        await message.editReply(data);
        return await message.fetchReply();
      } else {
        return await msg.edit(data);
      }
    };

    if ((await getDisabledCommands(message.guild)).includes("rob")) {
      return send({ embeds: [new ErrorEmbed("that command has been disabled")] });
    }

    if (args.length == 1) {
      return send({
        embeds: [new ErrorEmbed("/use lockpick <member>")],
      });
    }

    let lockPickTarget; // eslint-disable-line

    if (!message.mentions.members.first()) {
      lockPickTarget = await getMember(message.guild, args[1]);
    } else {
      lockPickTarget = message.mentions.members.first();
    }

    if (!lockPickTarget) {
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (message.member == lockPickTarget) {
      if ((await redis.exists(`${Constants.redis.cooldown.SEX_CHASTITY}:${message.author.id}`)) == 1) {
        await redis.del(`${Constants.redis.cooldown.SEX_CHASTITY}:${message.author.id}`);

        const msg = await send({ embeds: [new CustomEmbed(message.member, "picking chastity cage...")] });

        await sleep(2000);

        return await edit(
          {
            embeds: [
              new CustomEmbed(
                message.member,
                "picking *chastity cage*...\n\nyou are no longer equipped with a *chastity cage*"
              ),
            ],
          },
          msg
        );
      }
      return send({ embeds: [new ErrorEmbed("invalid user")] });
    }

    if (!(await hasPadlock(lockPickTarget))) {
      return send({
        embeds: [new ErrorEmbed("this member doesn't have a padlock")],
      });
    }

    const inventory = await getInventory(message.member, false);

    await Promise.all([
      setInventoryItem(message.member, "lock_pick", inventory.find((i) => i.item == "lock_pick").amount - 1, false),
      setPadlock(lockPickTarget, false),
    ]);

    const targetEmbed = new CustomEmbed();

    targetEmbed.setColor(Constants.EMBED_FAIL_COLOR);
    targetEmbed.setTitle("your padlock has been picked");
    targetEmbed.setDescription(
      "**" +
        message.member.user.tag +
        "** has picked your padlock in **" +
        message.guild.name +
        "**\n" +
        "your money is no longer protected by a padlock"
    );

    if ((await getDmSettings(lockPickTarget)).rob) {
      await lockPickTarget.send({ embeds: [targetEmbed] });
    }

    const msg = await send({
      embeds: [new CustomEmbed(message.member, `picking **${lockPickTarget.user.tag}**'s padlock...`)],
    });

    await sleep(2000);

    return edit(
      {
        embeds: [
          new CustomEmbed(
            message.member,
            `picking **${lockPickTarget.user.tag}'**s padlock...\n\nyou have successfully picked their padlock`
          ),
        ],
      },
      msg
    );
  }
);
