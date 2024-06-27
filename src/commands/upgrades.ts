import { BaseMessageOptions, InteractionReplyOptions, Message } from "discord.js";
import { Command } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getUpgrades } from "../utils/functions/economy/levelling";
import { getUpgradesData } from "../utils/functions/economy/utils";
import { getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("upgrades", "view your permanent upgrades", "money");

cmd.setRun(async (message) => {
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

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], ephemeral: true });
    return;
  }

  const upgrades = await getUpgrades(message.member);

  if (upgrades.length === 0)
    return send({
      embeds: [
        new CustomEmbed(message.member, "you have no permanent upgrades").setHeader(
          "permanent upgrades",
          message.author.avatarURL(),
        ),
      ],
    });

  return send({
    embeds: [
      new CustomEmbed(
        message.member,
        upgrades
          .map(
            (i) =>
              `\`${i.amount}x\` **${getUpgradesData()[i.upgradeId].name}** *${getUpgradesData()[
                i.upgradeId
              ].description.replace(
                "{x}",
                (i.upgradeId.includes("xp")
                  ? Math.floor(getUpgradesData()[i.upgradeId].effect * i.amount * 100)
                  : getUpgradesData()[i.upgradeId].effect * i.amount
                ).toPrecision(2),
              )}*`,
          )
          .join("\n"),
      ).setHeader("permanent upgrades", message.author.avatarURL()),
    ],
  });
});

module.exports = cmd;
