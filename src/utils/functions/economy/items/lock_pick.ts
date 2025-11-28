import {
  CommandInteraction,
  InteractionEditReplyOptions,
  Message,
  MessageEditOptions,
} from "discord.js";
import redis from "../../../../init/redis";
import { NypsiCommandInteraction, NypsiMessage } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import Constants from "../../../Constants";
import { getDisabledCommands } from "../../guilds/disabledcommands";
import { getMember } from "../../member";
import sleep from "../../sleep";
import { escapeFormattingCharacters } from "../../string";
import { isUserBlacklisted } from "../../users/blacklist";
import { getDmSettings } from "../../users/notifications";
import { hasPadlock, setPadlock } from "../balance";
import { removeInventoryItem } from "../inventory";
import { isPassive } from "../passive";
import { addStat } from "../stats";
import ms = require("ms");

module.exports = new ItemUse(
  "lock_pick",
  async (
    message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
    args: string[],
  ) => {
    const edit = async (data: MessageEditOptions, msg: Message) => {
      if (!(message instanceof Message)) {
        await message.editReply(data as InteractionEditReplyOptions);
        return await message.fetchReply();
      } else {
        return await msg.edit(data);
      }
    };

    if ((await isUserBlacklisted(message.guild.ownerId)).blacklisted) {
      return ItemUse.send(message, {
        embeds: [
          new ErrorEmbed(
            `the owner of this server (${(await message.guild.members.fetch(message.guild.ownerId)).toString()}) is blacklisted\n` +
              "this means that robbing and other aggressive commands are disabled for this server",
          ),
        ],
      });
    }

    if (args.length == 1) {
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed("/use lockpick <member>")],
      });
    }

    const lockPickTarget = await getMember(message.guild, args[1]);

    if (!lockPickTarget) {
      return ItemUse.send(message, { embeds: [new ErrorEmbed("invalid user")] });
    }

    if (message.member == lockPickTarget) {
      if (
        (await redis.exists(`${Constants.redis.cooldown.SEX_CHASTITY}:${message.author.id}`)) == 1
      ) {
        await redis.del(`${Constants.redis.cooldown.SEX_CHASTITY}:${message.author.id}`);

        const msg = await ItemUse.send(message, {
          embeds: [new CustomEmbed(message.member, "picking chastity cage...")],
        });

        await sleep(2000);

        return await edit(
          {
            embeds: [
              new CustomEmbed(
                message.member,
                "picking *chastity cage*...\n\nyou are no longer equipped with a *chastity cage*",
              ),
            ],
          },
          msg,
        );
      }
      return ItemUse.send(message, { embeds: [new ErrorEmbed("invalid user")] });
    }

    if ((await getDisabledCommands(message.guild)).includes("rob")) {
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed(`lockpicks have been disabled in ${message.guild.name}`)],
      });
    }

    if (
      lockPickTarget.joinedAt.getTime() > new Date().getTime() - ms("1 hour") &&
      !(await redis.get(
        `${Constants.redis.cache.guild.RECENTLY_ATTACKED}:${message.guildId}:${lockPickTarget.id}`,
      ))
    ) {
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed(`${lockPickTarget.toString()} cannot be robbed yet`)],
      });
    }

    if (await isPassive(lockPickTarget))
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed(`${lockPickTarget.toString()} is currently in passive mode`)],
      });

    if (await isPassive(message.member))
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed("you are currently in passive mode")],
      });

    if (!(await hasPadlock(lockPickTarget))) {
      return ItemUse.send(message, {
        embeds: [new ErrorEmbed("this member doesn't have a padlock")],
      });
    }

    await redis.set(
      `${Constants.redis.cache.guild.RECENTLY_ATTACKED}:${message.guildId}:${message.member.id}`,
      "t",
      "EX",
      ms("1 hour") / 1000,
    );

    await Promise.all([
      removeInventoryItem(message.member, "lock_pick", 1),
      addStat(message.member, "lock_pick"),
      setPadlock(lockPickTarget, false),
    ]);

    const targetEmbed = new CustomEmbed();

    targetEmbed.setColor(Constants.EMBED_FAIL_COLOR);
    targetEmbed.setTitle("your padlock has been picked");
    targetEmbed.setDescription(
      "**" +
        escapeFormattingCharacters(message.author.username) +
        "** has picked your padlock in **" +
        message.guild.name +
        "**\n" +
        "your money is no longer protected by a padlock",
    );

    if ((await getDmSettings(lockPickTarget)).rob) {
      await lockPickTarget.send({ embeds: [targetEmbed] });
    }

    const msg = await ItemUse.send(message, {
      embeds: [
        new CustomEmbed(
          message.member,
          `picking **${lockPickTarget.user.username.replaceAll("_", "\\_")}**'s padlock...`,
        ),
      ],
    });

    await sleep(2000);

    return edit(
      {
        embeds: [
          new CustomEmbed(
            message.member,
            `picking **${lockPickTarget.user.username.replaceAll("_", "\\_")}'**s padlock...\n\nyou have successfully picked their padlock`,
          ),
        ],
      },
      msg,
    );
  },
);
