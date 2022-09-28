import {
  APIApplicationCommandOptionChoice,
  BaseMessageOptions,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { getBalance, updateBalance } from "../utils/functions/economy/balance";
import { getPrestige } from "../utils/functions/economy/prestige";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { addWorker, emptyWorkersStored, getWorkers, upgradeWorker } from "../utils/functions/economy/workers";
import { getPrefix } from "../utils/functions/guilds/utils";
import { getTier, isPremium } from "../utils/functions/premium/premium";
import { Categories, Command, NypsiCommandInteraction } from "../utils/models/Command";
import { CustomEmbed, ErrorEmbed } from "../utils/models/EmbedBuilders";
import { getAllWorkers, Worker } from "../utils/models/Workers";

const cmd = new Command("workers", "view the available workers and manage your own", Categories.MONEY).setAliases([
  "worker",
  "minion",
  "minions",
  "slave",
  "slaves",
]);

const workerChoices: APIApplicationCommandOptionChoice<string>[] = [
  { name: "potato farmer", value: "0" },
  { name: "fisherman", value: "1" },
  { name: "miner", value: "2" },
  { name: "lumberjack", value: "3" },
  { name: "butcher", value: "4" },
  { name: "tailor", value: "5" },
  { name: "spacex", value: "6" },
];

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((view) => view.setName("view").setDescription("view your workers"))
  .addSubcommand((buy) =>
    buy
      .setName("buy")
      .setDescription("buy a worker")
      .addStringOption((option) =>
        option
          .setName("worker")
          .setDescription("worker you want to buy")
          .setChoices(...workerChoices)
          .setRequired(true)
      )
  )
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
  )
  .addSubcommand((reclaim) => reclaim.setName("reclaim").setDescription("obtain workers from your premium subscription"));

async function run(message: Message | (NypsiCommandInteraction & CommandInteraction), args: string[]) {
  const workers = getAllWorkers();

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

  const prefix = await getPrefix(message.guild);

  const listAllWorkers = () => {
    const embed = new CustomEmbed(message.member, "workers create items over time, which you can sell for money")
      .setHeader("workers", message.author.avatarURL())
      .setFooter({ text: `${prefix}workers help` });

    for (const w of Array.from(workers.keys())) {
      const Worker = workers.get(w);
      const worker = new Worker();
      embed.addField(
        `${worker.name}`,
        `**cost** $${worker.cost.toLocaleString()}\n**prestige** ${
          worker.prestige
        }\n**item worth** $${worker.perItem.toLocaleString()} / ${worker.itemName}\n**rate** ${worker
          .getHourlyRate()
          .toLocaleString()} ${worker.itemName} / hour`,
        true
      );
    }

    return send({ embeds: [embed] });
  };

  const listPersonalWorkers = async () => {
    const personalWorkers = await getWorkers(message.member);

    const embed = new CustomEmbed(
      message.member,
      `you have ${Object.keys(personalWorkers).length} worker${Object.keys(personalWorkers).length == 1 ? "" : "s"}`
    )
      .setHeader("your workers", message.author.avatarURL())
      .setFooter({ text: `${prefix}workers help` });

    for (const w of Object.keys(personalWorkers)) {
      const worker = Worker.fromStorage(personalWorkers[w]);
      embed.addField(
        `${worker.name}`,
        `**inventory** ${worker.stored.toLocaleString()} ${worker.itemName} / ${worker.maxStorage.toLocaleString()} ($${(
          worker.stored * worker.perItem
        ).toLocaleString()})\n` +
          `**level** ${worker.level}${
            worker.level >= 5 ? "" : `\n**upgrade cost** $${worker.getUpgradeCost().toLocaleString()}`
          }\n**item worth** $${worker.perItem.toLocaleString()} / ${worker.itemName}\n**rate** ${worker
            .getHourlyRate()
            .toLocaleString()} ${worker.itemName} / hour`,
        true
      );
    }

    return send({ embeds: [embed] });
  };

  if (args.length == 0) {
    if (Object.keys(await getWorkers(message.member)).length == 0) {
      return listAllWorkers();
    } else {
      return listPersonalWorkers();
    }
  } else {
    if (args[0].toLowerCase() == "buy") {
      if (args.length == 1) {
        return send({
          embeds: [new ErrorEmbed(`${prefix}workers buy <worker name>`)],
        });
      }

      let worker;

      if (args.length == 2) {
        if (args[1].length == 1) {
          if (workers.get(parseInt(args[1]))) {
            worker = workers.get(parseInt(args[1]));
          }
        }
      }

      if (worker) {
        worker = new worker();
      }

      if (!worker) {
        args.shift();
        const name = args.join(" ").toLowerCase();
        for (const w of Array.from(workers.keys())) {
          const Worker1 = workers.get(w);
          const worker1 = new Worker1();
          if (worker1.name == name) {
            worker = worker1;
            break;
          }
        }
      }

      if (!worker) {
        return send({
          embeds: [new ErrorEmbed("invalid worker, please use the worker name")],
        });
      }

      if (!(worker instanceof Worker)) {
        return send({
          embeds: [new ErrorEmbed("invalid worker, please use the worker name")],
        });
      }

      if (worker.prestige > (await getPrestige(message.member))) {
        return send({
          embeds: [
            new ErrorEmbed(
              `you need to be prestige **${worker.prestige}** to buy this worker, you are prestige **${await getPrestige(
                message.member
              )}**`
            ),
          ],
        });
      }

      if ((await getBalance(message.member)) < worker.cost) {
        return send({ embeds: [new ErrorEmbed("you cannot afford this worker")] });
      }

      const personalWorkers = await getWorkers(message.member);

      for (const w of Object.keys(personalWorkers)) {
        const worker1 = personalWorkers[w];

        if (worker1.id == worker.id) {
          return send({ embeds: [new ErrorEmbed("you already have this worker")] });
        }
      }

      await updateBalance(message.member, (await getBalance(message.member)) - worker.cost);

      await addWorker(message.member, worker.id);

      return send({
        embeds: [new CustomEmbed(message.member, `✅ you have bought a **${worker.name}**`)],
      });
    } else if (args[0].toLowerCase() == "claim" || args[0].toLowerCase() == "sell") {
      const personalWorkers = await getWorkers(message.member);

      let amountEarned = 0;
      let earnedBreakdown = "";

      for (const w of Object.keys(personalWorkers)) {
        const worker = Worker.fromStorage(personalWorkers[w]);

        amountEarned += Math.floor(worker.perItem * worker.stored);
        earnedBreakdown += `\n${worker.name} +$${Math.floor(
          worker.perItem * worker.stored
        ).toLocaleString()} (${worker.stored.toLocaleString()} ${worker.itemName})`;
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
    } else if (args[0].toLowerCase() == "upgrade") {
      if (args.length == 1) {
        return send({
          embeds: [new ErrorEmbed(`${prefix}workers upgrade <name>`)],
        });
      }

      let worker;

      if (args.length == 2) {
        if (args[1].length == 1) {
          if (workers.get(parseInt(args[1]))) {
            worker = workers.get(parseInt(args[1]));
          }
        }
      }

      if (worker) {
        worker = new worker();
      }

      if (!worker) {
        args.shift();
        const name = args.join(" ").toLowerCase();
        for (const w of Array.from(workers.keys())) {
          const Worker1 = workers.get(w);
          const worker1 = new Worker1();
          if (worker1.name == name) {
            worker = worker1;
            break;
          }
        }
      }

      if (!worker) {
        return send({
          embeds: [new ErrorEmbed("invalid worker, please use the worker name")],
        });
      }

      const memberWorkers = await getWorkers(message.member);

      if (!(worker instanceof Worker)) {
        return send({
          embeds: [new ErrorEmbed("invalid worker, please use the worker name")],
        });
      }

      worker = memberWorkers[worker.id];

      if (!worker) {
        return send({ embeds: [new ErrorEmbed("you don't have this worker")] });
      }

      worker = Worker.fromStorage(worker);

      if (worker.level >= 5) {
        return send({ embeds: [new ErrorEmbed("this worker is already max level")] });
      }

      if ((await getBalance(message.member)) < worker.getUpgradeCost()) {
        return send({
          embeds: [
            new ErrorEmbed(
              `the upgrade cost for \`${worker.name}\` is $${worker
                .getUpgradeCost()
                .toLocaleString()}, you can't afford this`
            ),
          ],
        });
      }

      await updateBalance(message.member, (await getBalance(message.member)) - worker.getUpgradeCost());

      await upgradeWorker(message.member, worker.id.toString());

      const embed = new CustomEmbed(message.member);

      embed.setHeader("workers", message.author.avatarURL());

      worker = (await getWorkers(message.member))[worker.id];

      worker = Worker.fromStorage(worker);

      embed.setDescription(
        `your ${worker.name} has been upgraded to level ${worker.level}\n\n` +
          `**item worth** $${worker.perItem.toLocaleString()} / ${worker.itemName}\n` +
          `**rate** ${worker.getHourlyRate()} ${worker.itemName} / hour\n` +
          `**inventory** ${worker.stored.toLocaleString()} ${worker.itemName} / ${worker.maxStorage.toLocaleString()}`
      );

      return send({ embeds: [embed] });
    } else if (args[0].toLowerCase() == "list") {
      return listAllWorkers();
    } else if (
      args[0].toLowerCase() == "reclaim" ||
      args[0].toLowerCase() == "patreon" ||
      args[0].toLowerCase() == "premium"
    ) {
      if (!(await isPremium(message.author.id))) {
        return send({
          embeds: [
            new ErrorEmbed("you must have a premium membership for this").setFooter({
              text: `${prefix}patreon`,
            }),
          ],
        });
      }

      let msg = "";

      const personalWorkers = await getWorkers(message.member);

      if ((await getTier(message.author.id)) >= 2) {
        let has = false;
        for (const w of Object.keys(personalWorkers)) {
          const worker1 = personalWorkers[w];

          if (worker1.id == 1) {
            has = true;
            break;
          }
        }
        if (!has) {
          await addWorker(message.member, 1);
          let name: any = workers.get(1);
          name = new name().name;
          msg += "+ " + name + "\n";
        }
      }

      if ((await getTier(message.author.id)) >= 3) {
        let has = false;
        for (const w of Object.keys(personalWorkers)) {
          const worker1 = personalWorkers[w];

          if (worker1.id == 3) {
            has = true;
            break;
          }
        }
        if (!has) {
          await addWorker(message.member, 3);
          let name: any = workers.get(3);
          name = new name().name;
          msg += "+ " + name + "\n";
        }
      }

      if ((await getTier(message.author.id)) >= 4) {
        let has = false;
        for (const w of Object.keys(personalWorkers)) {
          const worker1 = personalWorkers[w];

          if (worker1.id == 6) {
            has = true;
            break;
          }
        }
        if (!has) {
          await addWorker(message.member, 6);
          let name: any = workers.get(6);
          name = new name().name;
          msg += "+ " + name + "\n";
        }
      }

      if (msg == "") {
        msg = "you weren't able to claim any free workers";
      }

      return send({ embeds: [new CustomEmbed(message.member, msg)] });
    } else if (args[0].toLowerCase() == "view") {
      if (Object.keys(await getWorkers(message.member)).length == 0) {
        return listAllWorkers();
      } else {
        return listPersonalWorkers();
      }
    } else {
      const embed = new CustomEmbed(message.member).setHeader("workers", message.author.avatarURL());

      embed.setDescription(
        `${prefix}**workers list** *list all available workers*\n` +
          `${prefix}**workers buy** *buy a worker*\n` +
          `${prefix}**workers claim** *claim money from your workers*\n` +
          `${prefix}**workers upgrade** *upgrade a worker*`
      );

      return send({ embeds: [embed] });
    }
  }
}

cmd.setRun(run);

module.exports = cmd;
