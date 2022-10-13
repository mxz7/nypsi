import dayjs = require("dayjs");
import {
  ActionRowBuilder,
  APIApplicationCommandOptionChoice,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  SelectMenuBuilder,
  SelectMenuOptionBuilder,
  TextBasedChannel,
} from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { getBalance, updateBalance } from "../utils/functions/economy/balance";
import { getPrestige } from "../utils/functions/economy/prestige";
import { createUser, userExists } from "../utils/functions/economy/utils";
import {
  addWorker,
  addWorkerUpgrade,
  calcWorkerValues,
  emptyWorkersStored,
  getBaseUpgrades,
  getBaseWorkers,
  getWorkers,
} from "../utils/functions/economy/workers";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";
import { Worker } from "../utils/models/Workers";

const cmd = new Command("workers", "view the available workers and manage your own", Categories.MONEY).setAliases([
  "worker",
  "minion",
  "minions",
  "slave",
  "slaves",
]);

const workerChoices: APIApplicationCommandOptionChoice<string>[] = [
  { name: "potato farmer", value: "potato_farmer" },
  { name: "fisherman", value: "fisherman" },
  { name: "miner", value: "miner" },
  { name: "lumberjack", value: "lumberjack" },
  { name: "butcher", value: "butcher" },
  { name: "tailor", value: "tailor" },
  { name: "spacex", value: "spacex" },
];

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((view) => view.setName("view").setDescription("view all workers"))
  .addSubcommand((claim) => claim.setName("claim").setDescription("claim earned money from your workers"))
  .addSubcommand((upgrade) =>
    upgrade
      .setName("upgrade")
      .setDescription("upgrade a worker")
      .addStringOption((option) =>
        option
          .setName("worker")
          .setDescription("worker you want to upgrade")
          .setChoices(...workerChoices)
          .setRequired(true)
      )
  );

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  const baseWorkers = getBaseWorkers();

  if (!(await userExists(message.member))) await createUser(message.member);

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

  await addCooldown(cmd.name, message.member, 5);

  let userWorkers = await getWorkers(message.member);
  const prestige = await getPrestige(message.member);

  const isOwned = (workerId: string) => {
    for (const worker of userWorkers) {
      if (worker.workerId == workerId) return true;
    }

    return false;
  };

  const calcUpgradeCost = (upgradeId: string, owned: number) => {
    const baseUpgrades = getBaseUpgrades();

    const cost = baseUpgrades[upgradeId].base_cost + baseUpgrades[upgradeId].base_cost * owned * 0.5;

    return cost;
  };

  const showWorkers = async (defaultWorker = "potato_farmer", msg?: Message) => {
    const displayWorker = async (worker: Worker) => {
      const embed = new CustomEmbed(message.member);

      embed.setTitle(`${worker.name}${prestige < worker.prestige_requirement ? " [locked]" : ""}`);

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

      if (isOwned(worker.id)) {
        const userWorker = userWorkers.find((w) => w.workerId == worker.id);

        const { maxStorage, perInterval, perItem } = await calcWorkerValues(userWorker);

        let desc =
          `**inventory** ${userWorker.stored.toLocaleString()} ${worker.item_emoji} / ${maxStorage.toLocaleString()} ${
            worker.item_emoji
          }\n` +
          `**item worth** $${perItem.toLocaleString()} / ${worker.item_emoji}\n` +
          `**rate** ${perInterval.toLocaleString()} ${worker.item_emoji} / hour`;

        if (userWorker.stored < maxStorage) {
          let hours = Math.ceil((maxStorage - userWorker.stored) / perInterval);

          const diff = dayjs().add(hours, "hours").unix() - dayjs().unix();
          hours = diff / 3600;

          desc += `\n\n\`${hours.toLocaleString()} hour${hours > 1 ? "s" : ""}\` until full`;
        }

        embed.setDescription(desc);

        row.addComponents(new ButtonBuilder().setCustomId("upg").setLabel("upgrades").setStyle(ButtonStyle.Primary));
      } else {
        embed.setDescription(
          `**cost** $${worker.cost.toLocaleString()}\n` +
            `**required prestige** ${worker.prestige_requirement}\n\n` +
            `**item worth** $${worker.base.per_item.toLocaleString()} / ${worker.item_emoji}\n` +
            `**rate** ${worker.base.per_interval.toLocaleString()} ${worker.item_emoji} / hour`
        );

        embed.setFooter({ text: `you are prestige ${prestige}` });

        if (prestige >= worker.prestige_requirement) {
          row.addComponents(new ButtonBuilder().setCustomId("bu").setLabel("buy").setStyle(ButtonStyle.Primary));
        } else {
          row.addComponents(
            new ButtonBuilder().setCustomId("bu").setLabel("buy").setStyle(ButtonStyle.Primary).setDisabled(true)
          );
        }
      }

      return { embed: embed, buttonRow: row };
    };

    const options: SelectMenuOptionBuilder[] = [];

    for (const worker of Object.keys(baseWorkers)) {
      options.push(
        new SelectMenuOptionBuilder()
          .setLabel(
            `${baseWorkers[worker].name}${
              baseWorkers[worker].prestige_requirement > prestige ? " [locked]" : isOwned(worker) ? " [owned]" : ""
            }`
          )
          .setValue(baseWorkers[worker].id)
          .setDefault(baseWorkers[worker].id == defaultWorker ? true : false)
      );
    }

    let workersList = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new SelectMenuBuilder().setCustomId("worker").setOptions(options)
    );

    const { buttonRow, embed } = await displayWorker(baseWorkers[defaultWorker]);

    if (msg) {
      msg = await msg.edit({ embeds: [embed], components: [workersList, buttonRow] });
    } else {
      msg = await send({ embeds: [embed], components: [workersList, buttonRow] });
    }

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      const res = await msg
        .awaitMessageComponent({ filter, time: 30_000 })
        .then(async (i) => {
          await i.deferUpdate();
          return i;
        })
        .catch(() => {});

      if (!res) {
        msg.edit({ components: [] });
        return;
      }

      if (res.isSelectMenu()) {
        const { buttonRow, embed } = await displayWorker(baseWorkers[res.values[0]]);

        for (const option of options) {
          option.setDefault(false);

          if (option.data.value == res.values[0]) option.setDefault(true);
        }

        workersList = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new SelectMenuBuilder().setCustomId("worker").setOptions(options)
        );

        await res.message.edit({ embeds: [embed], components: [workersList, buttonRow] });
        return pageManager();
      } else if (res.customId == "bu") {
        const balance = await getBalance(message.member);

        const selected = options.filter((o) => o.data.default)[0].data.value;

        if (balance < baseWorkers[selected].cost) {
          await res.followUp({ embeds: [new ErrorEmbed("you cannot afford this worker")], ephemeral: true });
          return pageManager();
        } else {
          await addWorker(message.member, selected);

          userWorkers = await getWorkers(message.member);

          return showWorkers(selected, msg);
        }
      } else if (res.customId == "upg") {
        const selected = options.filter((o) => o.data.default)[0].data.value;
        return upgradeWorker(baseWorkers[selected], res.message);
      }
    };

    return pageManager();
  };

  const upgradeWorker = async (worker: Worker, msg?: Message, channel?: TextBasedChannel) => {
    const embed = new CustomEmbed(message.member);

    embed.setHeader(`${worker.name} upgrades`, message.author.avatarURL());

    let desc = "";

    const userWorker = userWorkers.find((w) => w.workerId == worker.id);
    const baseUpgrades = getBaseUpgrades();
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("ba").setLabel("back").setStyle(ButtonStyle.Danger)
    );

    for (const upgradeId of Object.keys(baseUpgrades)) {
      if (baseUpgrades[upgradeId].for && !baseUpgrades[upgradeId].for.includes(worker.id)) continue;

      if (baseUpgrades[upgradeId].base_cost) {
        const owned = userWorker.upgrades.find((u) => u.upgradeId == upgradeId)?.amount || 0;

        desc += `**${baseUpgrades[upgradeId].name}** ${owned}/${baseUpgrades[upgradeId].stack_limit}`;

        const button = new ButtonBuilder().setCustomId(`up-${upgradeId}`).setLabel(`⬆️ ${baseUpgrades[upgradeId].name}`);

        if (owned < baseUpgrades[upgradeId].stack_limit) {
          desc += ` - $${calcUpgradeCost(upgradeId, owned).toLocaleString()}`;
          button.setStyle(ButtonStyle.Success);
        } else {
          button.setStyle(ButtonStyle.Secondary);
          button.setDisabled(true);
        }
        desc += "\n";

        row.addComponents(button);
      } else if (userWorker.upgrades.find((u) => u.upgradeId == upgradeId)) {
        desc += `**${baseUpgrades[upgradeId].name}** ${userWorker.upgrades.find((u) => u.upgradeId == upgradeId).amount}/${
          baseUpgrades[upgradeId].stack_limit
        }\n`;
      }
    }

    embed.setDescription(desc);

    if (!msg) {
      msg = await channel.send({ embeds: [embed], components: [row] });
    } else {
      msg = await msg.edit({ embeds: [embed], components: [row] });
    }

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      const res = await msg
        .awaitMessageComponent({ filter, time: 30_000 })
        .then(async (i) => {
          await i.deferUpdate();
          return i;
        })
        .catch(() => {});

      if (!res) {
        msg.edit({ components: [] });
        return;
      }

      if (res.customId == "ba") {
        return showWorkers(worker.id, msg);
      } else if (res.customId.startsWith("up-")) {
        const upgradeId = res.customId.split("-")[1];

        if (
          userWorkers.find((w) => w.workerId == worker.id).upgrades.find((u) => u.upgradeId == upgradeId)?.amount >=
          baseUpgrades[upgradeId].stack_limit
        ) {
          await res.followUp({ embeds: [new ErrorEmbed("you have maxed out this upgrade")], ephemeral: true });

          userWorkers = await getWorkers(message.member);

          return upgradeWorker(worker, res.message);
        }

        const cost = calcUpgradeCost(
          upgradeId,
          userWorkers.find((w) => w.workerId == worker.id).upgrades.find((u) => u.upgradeId == upgradeId).amount || 0
        );

        const balance = await getBalance(message.member);

        if (balance < cost) {
          await res.followUp({ embeds: [new ErrorEmbed("you cannot afford this upgrade")], ephemeral: true });

          userWorkers = await getWorkers(message.member);

          return upgradeWorker(worker, res.message);
        }

        await updateBalance(message.member, balance - cost);
        await addWorkerUpgrade(message.member, worker.id, upgradeId);

        userWorkers = await getWorkers(message.member);

        return upgradeWorker(worker, res.message);
      }
    };

    return pageManager();
  };

  if (args.length == 0 || args[0].toLowerCase() == "view") {
    return showWorkers();
  } else if (args[0].toLowerCase() == "upgrade") {
    if (args.length == 1) {
      return showWorkers();
    }

    const worker = baseWorkers[args[1].toLowerCase()];

    if (!worker) {
      return showWorkers();
    }

    return upgradeWorker(worker, null, message.channel);
  } else if (args[0].toLowerCase() == "claim" || args[0].toLowerCase() == "sell") {
    let amountEarned = 0;
    let earnedBreakdown = "";

    for (const worker of userWorkers) {
      const baseWorker = baseWorkers[worker.workerId];

      const { perItem } = await calcWorkerValues(worker);

      amountEarned += Math.floor(perItem * worker.stored);
      earnedBreakdown += `\n${baseWorker.name} +$${Math.floor(
        perItem * worker.stored
      ).toLocaleString()} (${worker.stored.toLocaleString()} ${baseWorker.item_emoji})`;
    }

    if (amountEarned == 0) {
      return send({
        embeds: [new ErrorEmbed("you have no money to claim from your workers")],
      });
    }

    await emptyWorkersStored(message.member);
    await updateBalance(message.member, (await getBalance(message.member)) + amountEarned);

    const embed = new CustomEmbed(message.member, `+$**${amountEarned.toLocaleString()}**\n${earnedBreakdown}`).setHeader(
      "workers",
      message.author.avatarURL()
    );

    return send({ embeds: [embed] });
  }
}

cmd.setRun(run);

module.exports = cmd;
