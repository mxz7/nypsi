import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders.js";
import Constants from "../utils/Constants.js";
import { addProgress } from "../utils/functions/economy/achievements.js";
import { addBalance, getBalance, removeBalance } from "../utils/functions/economy/balance.js";
import { getInventory, setInventoryItem } from "../utils/functions/economy/inventory.js";
import { createGame } from "../utils/functions/economy/stats.js";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { createUser, userExists } from "../utils/functions/economy/utils.js";
import {
  addToNypsiBank,
  getNypsiBankBalance,
  removeFromNypsiBankBalance,
} from "../utils/functions/tax.js";
import {
  addCooldown,
  getRemaining,
  getResponse,
  onCooldown,
} from "../utils/handlers/cooldownhandler.js";

const cmd = new Command("bankrob", "attempt to rob a bank for a high reward", "money");

cmd.slashEnabled = true;

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction)) {
  if (!(await userExists(message.member))) await createUser(message.member);

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

  if ((await getBalance(message.member)) < 5_000) {
    return send({ embeds: [new ErrorEmbed("you must have at least $5k")], ephemeral: true });
  }

  const getMaxValues = async (bankBalance: number) => {
    const [balance, inventory] = await Promise.all([
      getBalance(message.member),
      getInventory(message.member),
    ]);

    let maxLoss = balance * 0.63;
    let maxSteal = balance * 0.5;

    if (maxLoss > bankBalance * 0.6) {
      maxLoss = bankBalance * 0.7;
      maxSteal = bankBalance * 0.5;
    } else if (maxSteal < 500_000) {
      maxSteal = 500_000;
      maxLoss = balance * 0.95;
    }

    let lawyer = false;

    if (
      inventory.find((i) => i.item == "lawyer") &&
      inventory.find((i) => i.item == "lawyer").amount > 0
    ) {
      lawyer = true;
      maxLoss = maxLoss * 0.35;
    }

    return { loss: Math.floor(maxLoss), steal: Math.floor(maxSteal), lawyer };
  };

  const displayBankInfo = async () => {
    const worth = await getNypsiBankBalance();
    const res = await getMaxValues(worth);
    const loss = res.loss;
    const steal = res.steal;
    const lawyer = res.lawyer;

    return `**nypsi**\n*$${worth.toLocaleString()}*\n\n**max steal** $${steal.toLocaleString()}\n**max loss** $${loss.toLocaleString()}${
      lawyer ? " 🧑‍⚖️" : ""
    }${
      (await onCooldown(cmd.name, message.member))
        ? `\n\non cooldown for \`${await getRemaining(cmd.name, message.member)}\``
        : ""
    }`;
  };

  const robBank = async (bank: string) => {
    if (await onCooldown(cmd.name, message.member)) {
      const res = await getResponse(cmd.name, message.member);

      if (res.respond) {
        if (message instanceof Message) {
          message.channel.send({ embeds: [res.embed] });
          return;
        } else {
          message.followUp({ embeds: [res.embed] });
          return;
        }
      }
      return;
    }

    if ((await getBalance(message.member)) < 5_000) {
      if (message instanceof Message) {
        message.channel.send({ embeds: [new ErrorEmbed("you must have at least $5k")] });
        return;
      } else {
        message.followUp({ embeds: [new ErrorEmbed("you must have at least $5k")] });
        return;
      }
    }

    await addCooldown(cmd.name, message.member, 900);

    const res = await getMaxValues(await getNypsiBankBalance());

    const loss = res.loss;
    const steal = res.steal;

    const chance = Math.floor(Math.random() * 100);

    const embed = new CustomEmbed(message.member).setHeader(
      `${message.author.username}'s robbery`,
      message.author.avatarURL(),
    );

    if (chance > 65) {
      const minStolen = Math.floor(steal * 0.5);

      const stolen = Math.floor(Math.random() * (steal - minStolen)) + minStolen;

      await Promise.all([
        addBalance(message.member, stolen),
        addProgress(message.author.id, "robber", 1),
        addTaskProgress(message.author.id, "thief"),
      ]);

      await removeFromNypsiBankBalance(stolen);

      const id = await createGame({
        userId: message.author.id,
        bet: 0,
        result: "win",
        earned: stolen,
        game: "bankrob",
        outcome: `${message.author.username} robbed ${bank}`,
      });

      embed.setDescription(
        `**success!**\n\n**you stole** $${stolen.toLocaleString()} from **${bank}**`,
      );
      embed.setColor(Constants.EMBED_SUCCESS_COLOR);
      embed.setFooter({ text: `id: ${id}` });

      return embed;
    } else {
      const inventory = await getInventory(message.member);
      let lawyer = false;

      if (
        inventory.find((i) => i.item == "lawyer") &&
        inventory.find((i) => i.item == "lawyer").amount > 0
      ) {
        lawyer = true;

        await setInventoryItem(
          message.member,
          "lawyer",
          inventory.find((i) => i.item == "lawyer").amount - 1,
        );
      }

      const minLoss = Math.floor(loss * 0.4);
      const totalLost = Math.floor(Math.random() * (loss - minLoss)) + minLoss;

      await removeBalance(message.member, totalLost);

      await addToNypsiBank(totalLost * 0.3);

      embed.setColor(Constants.EMBED_FAIL_COLOR);

      const id = await createGame({
        userId: message.author.id,
        bet: totalLost,
        result: "lose",
        game: "bankrob",
        outcome: `${message.author.username} robbed ${bank}`,
      });
      embed.setFooter({ text: `id: ${id}` });

      if (lawyer) {
        embed.setDescription(
          `**you were caught**\n\nthanks to your lawyer, you only lost $**${totalLost.toLocaleString()}**`,
        );
      } else {
        embed.setDescription(`**you were caught**\n\nyou lost $**${totalLost.toLocaleString()}**`);
      }
    }

    return embed;
  };

  const embed = new CustomEmbed(message.member)
    .setHeader("bank robbery", message.author.avatarURL())
    .setDescription(await displayBankInfo());

  if ((await getNypsiBankBalance()) < 100_000) {
    return send({ embeds: [new CustomEmbed(message.member, "nypsi bank is currently closed")] });
  }

  const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];

  if (!(await onCooldown(cmd.name, message.member)))
    components.push(
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder().setCustomId("ro").setLabel("rob").setStyle(ButtonStyle.Danger),
      ),
    );

  const msg = await send({ embeds: [embed], components });

  const filter = (i: Interaction) => i.user.id == message.author.id;

  const pageManager: any = async () => {
    const res = await msg
      .awaitMessageComponent({ filter, time: 60_000 })
      .then((i) => {
        setTimeout(() => {
          if (!i.replied) i.deferUpdate().catch(() => {});
        }, 2000);

        return i;
      })
      .catch(() => {});

    if (!res) {
      msg.edit({ components: [] });
      return;
    }

    if (res.customId == "ro") {
      const newEmbed = await robBank("nypsi");

      if (!newEmbed)
        return await res
          .update({ components: [] })
          .catch(() => res.message.edit({ components: [] }));

      await res
        .update({ embeds: [newEmbed], components: [] })
        .then(() => res.message.edit({ embeds: [newEmbed], components: [] }));
      return;
    }
  };

  return pageManager();
}

cmd.setRun(run);

module.exports = cmd;
