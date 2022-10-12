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
} from "discord.js";
import { addCooldown, getResponse, onCooldown } from "../utils/cooldownhandler";
import { getBalance } from "../utils/functions/economy/balance";
import { getPrestige } from "../utils/functions/economy/prestige";
import { createUser, userExists } from "../utils/functions/economy/utils";
import { addWorker, calcWorkerValues, getBaseWorkers, getWorkers } from "../utils/functions/economy/workers";
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
          .setLabel(`${baseWorkers[worker].name}${baseWorkers[worker].prestige_requirement > prestige ? " [locked]" : ""}`)
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
      }
    };

    return pageManager();
  };

  if (args.length == 0 || args[0].toLowerCase() == "view") {
    return showWorkers();
  }
}

cmd.setRun(run);

module.exports = cmd;
