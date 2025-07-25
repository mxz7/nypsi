import dayjs = require("dayjs");
import {
  ActionRowBuilder,
  APIApplicationCommandOptionChoice,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { inPlaceSort } from "fast-sort";
import prisma from "../init/database";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { Worker, WorkerByproducts } from "../types/Workers";
import Constants from "../utils/Constants";
import { getBalance, removeBalance } from "../utils/functions/economy/balance";
import { getBoosters } from "../utils/functions/economy/boosters";
import { getLevel, getPrestige, getRawLevel } from "../utils/functions/economy/levelling";
import { addStat } from "../utils/functions/economy/stats";
import {
  createUser,
  getBaseUpgrades,
  getBaseWorkers,
  getItems,
  userExists,
} from "../utils/functions/economy/utils";
import {
  addWorker,
  addWorkerUpgrade,
  calcWorkerValues,
  claimFromWorkers,
  evaluateWorker,
  getWorker,
  getWorkers,
} from "../utils/functions/economy/workers";
import { pluralize } from "../utils/functions/string";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";
import _ = require("lodash");

const cmd = new Command(
  "workers",
  "view the available workers and manage your own",
  "money",
).setAliases(["worker", "minion", "minions", "slave", "slaves"]);

const workerChoices: APIApplicationCommandOptionChoice<string>[] = Object.keys(
  getBaseWorkers(),
).map((x) => {
  return { name: x.replaceAll("_", " "), value: x };
});

inPlaceSort(workerChoices).asc((wch) => getBaseWorkers()[wch.value].prestige_requirement);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((view) => view.setName("view").setDescription("view all workers"))
  .addSubcommand((claim) =>
    claim.setName("claim").setDescription("claim earned money from your workers"),
  )
  .addSubcommand((upgrade) =>
    upgrade
      .setName("upgrade")
      .setDescription("upgrade a worker")
      .addStringOption((option) =>
        option
          .setName("worker")
          .setDescription("worker you want to upgrade")
          .setChoices(...workerChoices)
          .setRequired(true),
      ),
  );

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction),
  send: SendMessage,
  args: string[],
) {
  const baseWorkers = getBaseWorkers();

  if (!(await userExists(message.member))) await createUser(message.member);

  if (await onCooldown(cmd.name, message.member)) {
    const res = await getResponse(cmd.name, message.member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  await addCooldown(cmd.name, message.member, 5);

  let userWorkers = await getWorkers(message.member);
  const prestige = await getPrestige(message.member);
  const level = await getLevel(message.member);

  const isOwned = (workerId: string) => {
    for (const worker of userWorkers) {
      if (worker.workerId == workerId) return true;
    }

    return false;
  };

  const calcUpgradeCost = (workerId: string, upgradeId: string, owned: number, amount: number) => {
    const baseUpgrades = getBaseUpgrades();

    let totalCost = 0;

    let baseCost = _.clone(baseUpgrades[upgradeId]).base_cost;

    baseCost =
      baseCost *
      (baseWorkers[workerId].prestige_requirement >= 40
        ? baseWorkers[workerId].prestige_requirement / 40
        : 1);

    for (let i = owned; i < owned + amount; i++) {
      const cost = baseCost + baseCost * i;

      totalCost += cost;
    }

    return Math.floor(totalCost);
  };

  const showWorkers = async (defaultWorker = "quarry", msg?: Message, res?: ButtonInteraction) => {
    const displayWorker = async (worker: Worker) => {
      const embed = new CustomEmbed(message.member).disableFooter();

      embed.setHeader(
        `${worker.name}${
          (await getRawLevel(message.member)) < worker.prestige_requirement && !isOwned(worker.id)
            ? " [locked]"
            : ""
        }`,
        message.author.avatarURL(),
      );

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

      if (isOwned(worker.id)) {
        const userWorker = userWorkers.find((w) => w.workerId == worker.id);

        const { maxStorage, perInterval, perItem } = await calcWorkerValues(
          userWorker,
          message.client as NypsiClient,
        );

        let desc =
          `**inventory** ${userWorker.stored.toLocaleString()} ${
            worker.item_emoji
          } / ${maxStorage.toLocaleString()} ${worker.item_emoji}\n` +
          `**worth** $${perItem.toLocaleString()} / ${worker.item_emoji}\n` +
          `**rate** ${perInterval.toLocaleString()} ${worker.item_emoji} / hour`;

        if (userWorker.stored < maxStorage) {
          const boosters = await getBoosters(message.member);

          if (Array.from(boosters.keys()).includes("steve")) {
            desc += `\n\n${getItems()["steve"].emoji} steve is hard at work`;
          } else {
            let hours = Math.ceil((maxStorage - userWorker.stored) / perInterval);

            const diff = dayjs().add(hours, "hours").unix() - dayjs().unix();
            hours = diff / 3600;

            desc += `\n\n\`${hours.toLocaleString()} ${pluralize("hour", hours)}\` until full`;
          }
        }

        embed.setDescription(desc);

        row.addComponents(
          new ButtonBuilder().setCustomId("upg").setLabel("upgrades").setStyle(ButtonStyle.Primary),
        );
      } else {
        embed.setDescription(
          `**cost** $${worker.cost.toLocaleString()}\n` +
            `**required level** ${worker.prestige_requirement}\n\n` +
            `**worth** $${worker.base.per_item.toLocaleString()} / ${worker.item_emoji}\n` +
            `**rate** ${worker.base.per_interval.toLocaleString()} ${worker.item_emoji} / hour`,
        );

        embed.setFooter({ text: `you are prestige ${prestige} level ${level}` });

        if ((await getRawLevel(message.member)) >= worker.prestige_requirement) {
          row.addComponents(
            new ButtonBuilder().setCustomId("bu").setLabel("buy").setStyle(ButtonStyle.Primary),
          );
        } else {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId("bu")
              .setLabel("buy")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
          );
        }
      }

      return { embed: embed, buttonRow: row };
    };

    const options: StringSelectMenuOptionBuilder[] = [];

    for (const worker of Object.keys(baseWorkers)) {
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(
            `${baseWorkers[worker].name}${
              isOwned(worker)
                ? " [owned]"
                : baseWorkers[worker].prestige_requirement > (await getRawLevel(message.member))
                  ? " [locked]"
                  : ""
            }`,
          )
          .setValue(baseWorkers[worker].id)
          .setDefault(baseWorkers[worker].id == defaultWorker),
      );
    }

    let workersList = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId("worker").setOptions(options),
    );

    const { buttonRow, embed } = await displayWorker(baseWorkers[defaultWorker]);

    if (res) {
      await res
        .update({ embeds: [embed], components: [workersList, buttonRow] })
        .catch(() => msg.edit({ embeds: [embed], components: [workersList, buttonRow] }));
    } else if (msg) {
      msg = await msg.edit({ embeds: [embed], components: [workersList, buttonRow] });
    } else {
      msg = await send({ embeds: [embed], components: [workersList, buttonRow] });
    }

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      const res = await msg
        .awaitMessageComponent({ filter, time: 30_000 })
        .then(async (i) => {
          setTimeout(() => {
            if (!i.deferred && !i.replied) i.deferUpdate().catch(() => {});
          }, 2000);

          return i;
        })
        .catch(() => {});

      if (!res) {
        msg.edit({ components: [] });
        return;
      }

      if (res.isStringSelectMenu()) {
        const { buttonRow, embed } = await displayWorker(baseWorkers[res.values[0]]);

        for (const option of options) {
          option.setDefault(false);

          if (option.data.value == res.values[0]) option.setDefault(true);
        }

        workersList = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new StringSelectMenuBuilder().setCustomId("worker").setOptions(options),
        );

        await res
          .update({ embeds: [embed], components: [workersList, buttonRow] })
          .catch(() => res.message.edit({ embeds: [embed], components: [workersList, buttonRow] }));
        return pageManager();
      } else if (res.customId == "bu") {
        const balance = await getBalance(message.member);

        const selected = options.filter((o) => o.data.default)[0].data.value;

        if (balance < baseWorkers[selected].cost) {
          await res
            .reply({
              embeds: [new ErrorEmbed("you cannot afford this worker")],
              flags: MessageFlags.Ephemeral,
            })
            .catch(() =>
              res.followUp({
                embeds: [new ErrorEmbed("you cannot afford this worker")],
                flags: MessageFlags.Ephemeral,
              }),
            );
          return pageManager();
        } else {
          await removeBalance(message.member, baseWorkers[selected].cost);
          addStat(message.member, "spent-workers", baseWorkers[selected].cost);
          await addWorker(message.member, selected);

          userWorkers = await getWorkers(message.member);

          return showWorkers(selected, msg, res as ButtonInteraction);
        }
      } else if (res.customId == "upg") {
        const selected = options.filter((o) => o.data.default)[0].data.value;
        return upgradeWorker(baseWorkers[selected], res.message, res as ButtonInteraction);
      }
    };

    return pageManager();
  };

  const upgradeWorker = async (worker: Worker, msg?: Message, res?: ButtonInteraction) => {
    const embed = new CustomEmbed(message.member).disableFooter();

    embed.setHeader(`${worker.name} upgrades`, message.author.avatarURL());

    let desc = `💰 $${(await getBalance(message.member)).toLocaleString()}\n\n`;

    const userWorker = userWorkers.find((w) => w.workerId == worker.id);

    if (!userWorker) return send({ embeds: [new ErrorEmbed("you don't have this worker")] });

    const baseUpgrades = getBaseUpgrades();
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("ba").setLabel("back").setStyle(ButtonStyle.Danger),
    );
    const maxRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("ba2").setLabel("back").setStyle(ButtonStyle.Danger),
    );

    for (const upgradeId of Object.keys(baseUpgrades)) {
      if (baseUpgrades[upgradeId].for && !baseUpgrades[upgradeId].for.includes(worker.id)) continue;

      if (worker.id === "quarry" && !baseUpgrades[upgradeId].for) continue;

      if (baseUpgrades[upgradeId].base_cost) {
        const owned = userWorker.upgrades.find((u) => u.upgradeId == upgradeId)?.amount || 0;

        desc += `**${
          baseUpgrades[upgradeId].plural
            ? baseUpgrades[upgradeId].plural
            : baseUpgrades[upgradeId].name
        }** ${owned}/${baseUpgrades[upgradeId].stack_limit}`;

        const button = new ButtonBuilder()
          .setCustomId(`up-${upgradeId}`)
          .setEmoji("⬆️")
          .setLabel(`${baseUpgrades[upgradeId].name}`);
        const maxButton = new ButtonBuilder()
          .setCustomId(`up-${upgradeId}-max`)
          .setEmoji("⏫")
          .setLabel(baseUpgrades[upgradeId].name);

        if (owned < baseUpgrades[upgradeId].stack_limit) {
          desc += ` - $${calcUpgradeCost(
            userWorker.workerId,
            upgradeId,
            owned,
            1,
          ).toLocaleString()}`;
          button.setStyle(ButtonStyle.Success);
          maxButton.setStyle(ButtonStyle.Success);
        } else {
          button.setStyle(ButtonStyle.Secondary);
          maxButton.setStyle(ButtonStyle.Secondary);
          button.setDisabled(true);
          maxButton.setDisabled(true);
        }
        desc += "\n";

        row.addComponents(button);
        maxRow.addComponents(maxButton);
      } else if (userWorker.upgrades.find((u) => u.upgradeId == upgradeId)) {
        desc += `**${
          baseUpgrades[upgradeId].plural
            ? baseUpgrades[upgradeId].plural
            : baseUpgrades[upgradeId].name
        }** ${userWorker.upgrades.find((u) => u.upgradeId == upgradeId).amount}/${
          baseUpgrades[upgradeId].stack_limit
        }\n`;
      }
    }

    embed.setDescription(desc);

    if (res) {
      await res
        .update({ embeds: [embed], components: [row, maxRow] })
        .catch(() => msg.edit({ embeds: [embed], components: [row, maxRow] }));
    } else if (msg) {
      msg = await msg.edit({ embeds: [embed], components: [row, maxRow] });
    } else {
      msg = await send({ embeds: [embed], components: [row, maxRow] });
    }

    const filter = (i: Interaction) => i.user.id == message.author.id;

    const pageManager: any = async () => {
      const res = await msg
        .awaitMessageComponent({ filter, time: 30_000 })
        .then(async (i) => {
          setTimeout(() => {
            if (!i.deferred && !i.replied) i.deferUpdate().catch(() => {});
          }, 2000);
          return i;
        })
        .catch(() => {});

      if (!res) {
        msg.edit({ components: [] });
        return;
      }

      if (res.customId == "ba" || res.customId === "ba2") {
        return showWorkers(worker.id, msg, res as ButtonInteraction);
      } else if (res.customId.startsWith("up-")) {
        const upgradeId = res.customId.split("-")[1];

        if (
          userWorkers
            .find((w) => w.workerId == worker.id)
            .upgrades.find((u) => u.upgradeId == upgradeId)?.amount >=
          baseUpgrades[upgradeId].stack_limit
        ) {
          await res
            .reply({
              embeds: [new ErrorEmbed("you have maxed out this upgrade")],
              flags: MessageFlags.Ephemeral,
            })
            .catch(() =>
              res.followUp({
                embeds: [new ErrorEmbed("you have maxed out this upgrade")],
                flags: MessageFlags.Ephemeral,
              }),
            );

          userWorkers = await getWorkers(message.member);

          return upgradeWorker(worker, res.message, res as ButtonInteraction);
        }

        const cost = calcUpgradeCost(
          worker.id,
          upgradeId,
          userWorkers
            .find((w) => w.workerId == worker.id)
            .upgrades.find((u) => u.upgradeId == upgradeId)?.amount || 0,
          res.customId.endsWith("-max")
            ? baseUpgrades[upgradeId].stack_limit -
                (userWorkers
                  .find((w) => w.workerId === worker.id)
                  .upgrades.find((u) => u.upgradeId === upgradeId)?.amount || 0)
            : 1,
        );

        const balance = await getBalance(message.member);

        if (balance < cost) {
          await res
            .reply({
              embeds: [new ErrorEmbed(`you cannot afford this ($${cost.toLocaleString()})`)],
              flags: MessageFlags.Ephemeral,
            })
            .catch(() =>
              res.followUp({
                embeds: [new ErrorEmbed(`you cannot afford this ($${cost.toLocaleString()})`)],
                flags: MessageFlags.Ephemeral,
              }),
            );

          userWorkers = await getWorkers(message.member);

          return upgradeWorker(worker, res.message, res as ButtonInteraction);
        }

        await removeBalance(message.member, cost);
        addStat(message.member, "spent-workers", cost);
        await addWorkerUpgrade(
          message.member,
          worker.id,
          upgradeId,
          res.customId.endsWith("-max")
            ? baseUpgrades[upgradeId].stack_limit -
                (userWorkers
                  .find((w) => w.workerId === worker.id)
                  .upgrades.find((u) => u.upgradeId === upgradeId)?.amount || 0)
            : 1,
        );

        userWorkers = await getWorkers(message.member);

        return upgradeWorker(worker, res.message, res as ButtonInteraction);
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

    return upgradeWorker(worker);
  } else if (args[0].toLowerCase() == "claim" || args[0].toLowerCase() == "sell") {
    const desc = await claimFromWorkers(message.author.id, message.client as NypsiClient);

    const embed = new CustomEmbed(message.member, desc)
      .setHeader("workers", message.author.avatarURL())
      .disableFooter();

    return send({ embeds: [embed] });
  } else if (args[0].toLowerCase() == "debug" && message.author.id === Constants.TEKOH_ID) {
    const debugInfoEmbed = new CustomEmbed(
      message.member,
      "$workers debug set <worker> <amount> - set a worker's stored amount" +
        "\n$workers debug reset <worker> - resets a worker's upgrades" +
        "\n$workers debug value <worker> <# claims> - simulates <#> claims of <worker> with the current stored amount",
    );

    const worker = baseWorkers[args[2]?.toLowerCase()];
    const value = parseInt(args[3]);
    if (args[1]?.toLowerCase() == "set") {
      if (!(worker && value)) return send({ embeds: [debugInfoEmbed] });
      await prisma.economyWorker.update({
        where: {
          userId_workerId: {
            userId: message.author.id,
            workerId: worker.id,
          },
        },
        data: {
          stored: value,
        },
      });
      logger.info(
        `workers debug: ${message.author.id} (${message.author.username}) set stored for ${worker.id} to ${value}`,
      );
      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            `set stored for **${worker.id}** to ${value} ${worker.item_emoji}`,
          ).setHeader("workers debug", message.author.avatarURL()),
        ],
      });
    } else if (args[1]?.toLowerCase() == "reset") {
      if (!worker) return send({ embeds: [debugInfoEmbed] });
      await prisma.economyWorkerUpgrades.updateMany({
        where: {
          userId: message.author.id,
          workerId: worker.id,
        },
        data: {
          amount: 0,
        },
      });
      logger.info(
        `workers debug: ${message.author.id} (${message.author.username}) reset upgrades for ${worker.id}`,
      );
      return send({
        embeds: [
          new CustomEmbed(message.member, `reset upgrades for **${worker.id}**`).setHeader(
            "workers debug",
            message.author.avatarURL(),
          ),
        ],
      });
    } else if (args[1]?.toLowerCase() == "value") {
      if (!(worker && value)) return send({ embeds: [debugInfoEmbed] });
      let totalEarned = 0;
      const totalByproducts = {} as WorkerByproducts;
      let byproductsDescription = "";
      for (let i = 0; i < value; i++) {
        const { amountEarned, byproductAmounts } = await evaluateWorker(
          message.client as NypsiClient,
          message.author.id,
          worker,
          {},
        );
        totalEarned += amountEarned;
        for (const byproduct in byproductAmounts) {
          if (totalByproducts[byproduct] == undefined) totalByproducts[byproduct] = 0;
          totalByproducts[byproduct] += byproductAmounts[byproduct];
        }
      }
      for (const byproduct in totalByproducts) {
        const item = getItems()[byproduct];
        const amount = totalByproducts[byproduct];
        byproductsDescription += `\n  **${(amount / value).toFixed(3)}** ${item.emoji} ${amount === value ? item.name : item.plural}`;
      }
      return send({
        embeds: [
          new CustomEmbed(
            message.member,
            `average yield for **${worker.id}** over ${value} ${pluralize("run", value)} ` +
              `at ${(await getWorker(message.member, worker)).stored} ${worker.item_emoji} is **$${(totalEarned / value).toFixed(3)}**` +
              (totalByproducts.size > 0 ? " and:" : "") +
              byproductsDescription,
          ).setHeader("workers debug", message.author.avatarURL()),
        ],
      });
    } else {
      return send({ embeds: [debugInfoEmbed] });
    }
  } else {
    return showWorkers();
  }
}

cmd.setRun(run);

module.exports = cmd;
