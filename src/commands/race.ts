import { randomInt } from "crypto";
import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  InteractionCollector,
  InteractionReplyOptions,
  Message,
  MessageActionRowComponentBuilder,
  MessageCreateOptions,
  MessageEditOptions,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  User,
} from "discord.js";
import { inPlaceSort, sort } from "fast-sort";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { Item } from "../types/Economy";
import { addProgress } from "../utils/functions/economy/achievements";
import { calcMaxBet, getBalance, updateBalance } from "../utils/functions/economy/balance";
import { Car, calcSpeed, getCarEmoji, getGarage } from "../utils/functions/economy/cars";
import { getInventory } from "../utils/functions/economy/inventory";
import { createGame } from "../utils/functions/economy/stats";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { createUser, formatBet, getItems, userExists } from "../utils/functions/economy/utils";
import sleep from "../utils/functions/sleep";
import ms = require("ms");

const cmd = new Command("race", "create or join a race", "money").setAliases(["sr"]);

cmd.slashEnabled = true;
cmd.slashData.addSubcommand((start) =>
  start
    .setName("start")
    .setDescription("start a race")
    .addIntegerOption((option) =>
      option
        .setName("bet")
        .setDescription("this is the bet and the entry fee for the race")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName("length").setDescription("length of the race. default = 100"),
    )
    .addIntegerOption((option) =>
      option.setName("limit").setDescription("speed limit for the race"),
    ),
);

async function run(
  message: Message | (NypsiCommandInteraction & CommandInteraction),
  args: string[],
) {
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

  if (args.length === 0) {
    return send({
      embeds: [
        new CustomEmbed(
          message.member,
          "**/race start <bet> (length) (speed limit)** create a race",
        ),
      ],
    });
  }

  if (["start", "create"].includes(args[0].toLowerCase())) {
    const bet = (await formatBet(args[1] || 0, message.member)) || 0;
    const length = parseInt(args[2] || "100") || 100;
    const limit = parseInt(args[3] || "-1") || -1;

    if (bet < 0)
      return send({ embeds: [new ErrorEmbed("/streetrace start <bet> (length) (speed limit)")] });

    if (length > 1000)
      return send({ embeds: [new ErrorEmbed("length cannot be more than 1,000")] });

    let description = "";
    description += `starts <t:${Math.floor((Date.now() + 60000) / 1000)}:R>\n`;
    description += `**bet** $${bet.toLocaleString()}\n`;
    if (length !== 100) description += `**length** ${length.toLocaleString()}\n`;
    if (limit !== -1) description += `**limit** ${limit.toLocaleString()}\n`;

    const embed = new CustomEmbed(message.member, description).setHeader(
      `${message.author.username}'s race`,
      message.author.avatarURL(),
    );
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder().setCustomId("join").setLabel("join race").setStyle(ButtonStyle.Success),
    );

    const msg = await send({ embeds: [embed], components: [row] });

    new Race(msg, embed, bet, length, limit);
  }
}

cmd.setRun(run);

module.exports = cmd;

class Race {
  private message: Message;
  private started = false;
  private ended = false;
  private members: RaceUserDetails[] = [];
  private embed: CustomEmbed;
  private bet: number;
  private length: number;
  private limit: number;
  private collector: InteractionCollector<ButtonInteraction>;
  private init: number;
  private startedAt: number;

  constructor(message: Message, embed: CustomEmbed, bet: number, length: number, limit: number) {
    this.message = message;
    this.embed = embed;
    this.bet = bet;
    this.length = length;
    this.limit = limit;
    this.collector = this.message.createMessageComponentCollector({
      componentType: ComponentType.Button,
    });
    this.init = Date.now();

    this.collector.on("collect", (e) => this.collectorFunction(e));
    setTimeout(() => {
      this.start();
    }, 60000);
  }

  private async collectorFunction(interaction: ButtonInteraction): Promise<any> {
    if (!(await userExists(interaction.user.id)))
      return interaction.reply({
        ephemeral: true,
        embeds: [new ErrorEmbed("you cannot afford the entry fee for this race")],
      });

    if (this.members.find((i) => i.user.id === interaction.user.id))
      return interaction.deferUpdate();

    const [garage, inventory, balance] = await Promise.all([
      getGarage(interaction.user.id),
      getInventory(interaction.user.id).then((i) =>
        i.filter((i) => getItems()[i.item].role === "car"),
      ),
      getBalance(interaction.user.id),
    ]);

    const maxBet = (await calcMaxBet(interaction.user.id)) * 10;

    if (maxBet < this.bet)
      return interaction.reply({
        ephemeral: true,
        embeds: [new ErrorEmbed(`your max bet for races is $${maxBet.toLocaleString()}`)],
      });

    if (balance < this.bet)
      return interaction.reply({
        ephemeral: true,
        embeds: [new ErrorEmbed("you cannot afford the entry fee for this race")],
      });

    inventory.push({ amount: 1, item: "cycle" });

    const cars: (RaceUserItem | RaceUserCar)[] = [
      ...garage.map((car) => ({
        type: "car" as const,
        car,
        speed: calcSpeed(car),
        emoji: getCarEmoji(car),
      })),
      ...inventory.map((car) => ({
        type: "item" as const,
        car: getItems()[car.item],
        speed: getItems()[car.item].speed,
        emoji: getItems()[car.item].emoji,
      })),
    ];

    inPlaceSort(cars).desc((car) => {
      if (car.type === "car") {
        return calcSpeed(car.car);
      } else return car.car.speed;
    });

    const options = cars.map((car) => {
      const option = new StringSelectMenuOptionBuilder();

      option.setLabel(`${car.car.name} [${car.speed}]`);
      option.setValue(`${car.car.id}`);

      if (car.type === "car") option.setEmoji(getCarEmoji(car.car));
      else option.setEmoji(car.car.emoji);

      return option;
    });

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new StringSelectMenuBuilder().setOptions(options).setCustomId("car"),
    );

    if (this.started)
      return interaction.reply({
        ephemeral: true,
        embeds: [new ErrorEmbed("the race has already started")],
      });

    const msg = await interaction
      .reply({
        ephemeral: true,
        embeds: [
          new CustomEmbed(interaction.user.id, "choose a car").setHeader(
            this.embed.data.author.name,
            this.embed.data.author.icon_url,
          ),
        ],
        components: [row],
      })
      .then(() => interaction.fetchReply());

    const carInteraction = await msg
      .awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.user.id === interaction.user.id,
        time: 30000,
      })
      .catch(() => {});

    if (!carInteraction) return;

    if ((await getBalance(interaction.user.id)) < this.bet)
      return carInteraction.reply({
        ephemeral: true,
        embeds: [new ErrorEmbed("you cannot afford the entry fee for this race")],
      });

    if (this.members.find((i) => i.user.id === interaction.user.id))
      return interaction.deferUpdate();

    const chosen = carInteraction.values[0];

    if (cars.find((i) => i.car.id === chosen).speed > this.limit)
      return carInteraction.reply({
        ephemeral: true,
        embeds: [new ErrorEmbed("this car is faster than the speed limit for this race")],
      });

    await updateBalance(interaction.user.id, (await getBalance(interaction.user.id)) - this.bet);

    this.members.push({
      car: cars.find((i) => i.car.id === chosen),
      position: 0,
      user: interaction.user,
    });

    this.message.edit(this.render());

    return carInteraction.update({
      components: [],
      embeds: [
        new CustomEmbed(
          interaction.user.id,
          `chosen **${cars.find((i) => i.car.id === chosen).car.name}**`,
        ).setHeader(this.embed.data.author.name, this.embed.data.author.icon_url),
      ],
    });
  }

  private render() {
    const target = 10;
    const divisor = this.length / target;

    let description = "";
    if (!this.started) description += `starts <t:${Math.floor((this.init + 60000) / 1000)}:R>\n`;
    description += `**bet** $${this.bet.toLocaleString()}\n`;
    if (this.length !== 100) description += `**length** ${this.length.toLocaleString()}\n`;
    if (this.limit !== -1) description += `**limit** ${this.limit.toLocaleString()}\n`;

    const actualPos = (index: number) => index * divisor;

    for (const member of this.members) {
      let line = "\n";
      let addedCar = false;

      for (let i = 1; i < this.length / divisor + 1; i++) {
        if (member.position <= actualPos(i) && !addedCar) {
          line += member.car.emoji;
          addedCar = true;
        } else line += "\\_";
      }

      line += ` 🏁 \`${member.user.username}\``;

      description += line;
    }

    this.embed.setDescription(description);
    this.embed.setFooter({ text: `${this.members.length} racers` });

    const payload: MessageEditOptions = { embeds: [this.embed] };

    if (this.started) payload.components = [];

    return payload;
  }

  private async start() {
    if (this.members.length < 2) {
      if (this.bet > 0) {
        for (const member of this.members) {
          await updateBalance(member.user.id, (await getBalance(member.user.id)) + this.bet);
        }
      }

      this.embed.setDescription("not enough people joined ):");
      return this.message.edit({ embeds: [this.embed], components: [] });
    }

    this.started = true;
    this.startedAt = Date.now();
    let winner: User;
    this.message = await this.message.channel.send(this.render() as MessageCreateOptions);

    while (!this.ended) {
      if (this.startedAt < Date.now() - ms("10 minutes")) {
        this.ended = true;

        if (this.bet > 0) {
          for (const member of this.members) {
            await updateBalance(member.user.id, (await getBalance(member.user.id)) + this.bet);
          }
        }

        this.embed.setDescription(
          this.embed.data.description + "\n\nthis race took too long to finish",
        );
        return this.message.edit({ embeds: [this.embed] });
      }

      for (const member of this.members) {
        const randomness = randomInt(-5, 6);

        const movement = member.car.speed + randomness;

        if (member.position + movement < member.position) continue;
        if (member.position + movement > this.length) member.position = this.length;
        else member.position += movement;

        if (member.position >= this.length) {
          winner = member.user;
          break;
        }
      }

      await this.message.edit(this.render());

      if (winner) {
        this.ended = true;

        const ordered = sort(this.members).desc((i) => i.position);
        const diff = ordered[0].position - ordered[1].position;

        let description = this.message.embeds[0].description;

        const winnings = this.bet * this.members.length;

        if (this.bet)
          await updateBalance(
            winner.id,
            (await getBalance(winner.id)) + this.bet * this.members.length,
          );

        addProgress(winner.id, "racer", 1);
        addTaskProgress(winner.id, "vin_diesel");

        description +=
          `\n\n**${winner.username}** has won with their ${
            this.members.find((i) => i.user.id === winner.id).car.emoji
          } **${this.members.find((i) => i.user.id === winner.id).car.car.name}** by ${diff.toLocaleString()} distance` +
          `${
            this.bet
              ? `\n +
          +$${winnings.toLocaleString()}`
              : ""
          }`;

        let gameId: string;

        for (const member of this.members) {
          if (member.user.id === winner.id) {
            gameId = await createGame({
              userId: member.user.id,
              bet: this.bet,
              game: "race",
              result: "win",
              earned: this.bet * this.members.length,
              outcome: this.embed.data.description,
            });
          }

          await createGame({
            userId: member.user.id,
            bet: this.bet,
            game: "race",
            result: "lose",
            outcome: this.embed.data.description,
          });
        }

        this.embed.setDescription(description);
        this.embed.setFooter({ text: `race has ended | id: ${gameId}` });

        return setTimeout(async () => {
          await this.message.edit({ embeds: [this.embed] }).catch(() => {});
        }, 500);
      }

      await sleep(750);
    }
  }
}

type RaceUserDetails = { position: number; car: RaceUserCar | RaceUserItem; user: User };

type RaceUserCar = {
  type: "car";
  car: Car;
  speed: number;
  emoji: string;
};

type RaceUserItem = {
  type: "item";
  car: Item;
  speed: number;
  emoji: string;
};
