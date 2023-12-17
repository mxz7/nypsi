import {
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { randomInt } from "mathjs";
import { NypsiCommandInteraction } from "../../../../models/Command";
import { CustomEmbed, ErrorEmbed } from "../../../../models/EmbedBuilders";
import { ItemUse } from "../../../../models/ItemUse";
import { UserUpgrade } from "../../../../types/Economy";
import sleep from "../../sleep";
import { addInventoryItem, getInventory, setInventoryItem } from "../inventory";
import { getUpgrades, setUpgrade } from "../levelling";
import { addStat } from "../stats";
import { getUpgradesData } from "../utils";

module.exports = new ItemUse(
  "reroll_token",
  async (message: Message | (NypsiCommandInteraction & CommandInteraction), args) => {
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

    const inventory = await getInventory(message.member);

    if (
      !inventory.find((i) => i.item === "reroll_token") ||
      inventory.find((i) => i.item === "reroll_token").amount < 1
    )
      return send({ embeds: [new ErrorEmbed("you don't have a reroll token")] });

    if (args.length < 2)
      return send({
        embeds: [new ErrorEmbed("you need to specify an upgrade that you want to reroll")],
      });

    const search = args.slice(1).join(" ").toLowerCase();
    let selected: UserUpgrade;

    for (const upgrade of Object.values(getUpgradesData())) {
      if (search === upgrade.id || search === upgrade.name) selected = upgrade;
    }

    if (!selected)
      return send({ embeds: [new ErrorEmbed(`couldn't find an upgrade with the name ${search}`)] });

    const upgrades = await getUpgrades(message.member);

    if (
      !upgrades.find((i) => i.upgradeId === selected.id) ||
      upgrades.find((i) => i.upgradeId === selected.id).amount < 1
    )
      return send({ embeds: [new ErrorEmbed("you dont have this upgrade")] });

    await setInventoryItem(
      message.member,
      "reroll_token",
      inventory.find((i) => i.item === "reroll_token").amount - 1,
    );
    await addStat(message.member, "reroll_token");

    const upgradesPool: string[] = [];
    let attempts = 0;

    while (upgradesPool.length === 0 && attempts < 100) {
      attempts++;
      for (const upgrade of Object.values(getUpgradesData())) {
        if (
          (upgrades.find((i) => i.upgradeId === upgrade.id) &&
            upgrades.find((i) => i.upgradeId === upgrade.id).amount >= upgrade.max) ||
          upgrade.id === selected.id
        )
          continue;

        upgradesPool.push(upgrade.id);
      }
    }

    const chosen =
      upgradesPool.length > 0 ? upgradesPool[Math.floor(Math.random() * upgradesPool.length)] : "";

    let desc = "";

    if (chosen) {
      await setUpgrade(
        message.member,
        selected.id,
        upgrades.find((i) => i.upgradeId === selected.id).amount - 1,
      );

      await setUpgrade(
        message.member,
        chosen,
        upgrades.find((i) => i.upgradeId === chosen)
          ? upgrades.find((i) => i.upgradeId === chosen).amount + 1
          : 1,
      );

      desc = `you rerolled **${selected.name}** into **${getUpgradesData()[chosen].name}**`;
    } else {
      const pieces = randomInt(5, 13);
      desc = `your reroll token failed and shattered into ${pieces} <:nypsi_gem_shard:1088524343367188510> shards`;
      await addInventoryItem(message.member, "gem_shard", pieces);
    }

    const embed = new CustomEmbed(message.member, `rerolling ${selected.name}...`);

    const msg = await send({ embeds: [embed] });

    await sleep(2000);

    embed.setDescription(desc);

    msg.edit({ embeds: [embed] });
  },
);
