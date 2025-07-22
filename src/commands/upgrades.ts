import { MessageFlags } from "discord.js";
import { Command } from "../models/Command";
import { CustomEmbed } from "../models/EmbedBuilders";
import { getUpgrades } from "../utils/functions/economy/levelling";
import { getUpgradesData } from "../utils/functions/economy/utils";
import { getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("upgrades", "view your permanent upgrades", "money");

cmd.setRun(async (message, send) => {
  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
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
                (i.upgradeId.includes("xp") || i.upgradeId === "farm_output"
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
