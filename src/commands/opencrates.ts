import { BaseMessageOptions, CommandInteraction, InteractionReplyOptions, Message } from "discord.js";
import { Categories, Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { getInventory, openCrate } from "../utils/functions/economy/inventory";
import { getItems, startOpeningCrates, stopOpeningCrates } from "../utils/functions/economy/utils";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("opencrates", "open all of your crates with one command", Categories.MONEY);

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
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

  if (await onCooldown(cmd.name, message.member)) {
    const embed = await getResponse(cmd.name, message.member);

    return send({ embeds: [embed], ephemeral: true });
  }

  const inventory = await getInventory(message.member);
  const items = getItems();

  const crates: string[] = [];

  let max = 5;
  let hitMax = false;

  if (await isPremium(message.member)) {
    if ((await getTier(message.member)) >= 3) {
      max = 20;
    } else {
      max = 10;
    }
  }

  for (const item of inventory) {
    if (items[item.item].role == "crate") {
      let amount = 0;
      while (amount < inventory.find((i) => i.item == item.item).amount) {
        if (item.item == "nypsi_crate") {
          if (crates.length != 0 && max != 5) break;

          max = 5;
        }

        amount++;
        crates.push(item.item);
        if (crates.length >= max) {
          hitMax = true;
          break;
        }
      }
    }
  }

  if (crates.length == 0) {
    return send({ embeds: [new ErrorEmbed("you dont have any crates to open")] });
  }

  startOpeningCrates(message.member);

  await addCooldown(cmd.name, message.member, 120);

  const embed = new CustomEmbed(message.member);

  embed.setTitle("opening crates");

  let desc = `opening ${crates.length} crates${hitMax ? " (limited)" : ""}`;

  embed.setDescription(desc);

  desc += "\n\nyou found:\n";

  let fail = false;

  const msg = await message.member.send({ embeds: [embed] }).catch(() => {
    fail = true;
  });

  if (fail || !(msg instanceof Message)) {
    await stopOpeningCrates(message.member);
    const reply = new ErrorEmbed("failed to dm you, please check your privacy settings");
    if (message.interaction) {
      return send({ embeds: [reply], ephemeral: true });
    } else {
      return send({ embeds: [reply] });
    }
  } else {
    const reply = new CustomEmbed(message.member, `✅ [check your dms](${msg.url})`);
    await send({ embeds: [reply] });
  }

  const doCrate = async () => {
    let finished = false;
    const crate = crates.shift();

    const found = await openCrate(message.member, items[crate]);

    desc += ` - ${found.join("\n - ")}\n`;

    if (crates.length == 0) {
      desc += "\n\nfinished (:";
      finished = true;
    }

    embed.setDescription(desc);

    await msg.edit({ embeds: [embed] });

    if (finished) {
      stopOpeningCrates(message.member);
    } else {
      await wait(1500);

      doCrate();
    }
  };
  doCrate();
}

cmd.setRun(run);

module.exports = cmd;

async function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(0);
    }, ms);
  });
}
