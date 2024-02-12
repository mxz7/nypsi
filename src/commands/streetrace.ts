import {
  BaseMessageOptions,
  ChannelType,
  CommandInteraction,
  InteractionReplyOptions,
  Message,
} from "discord.js";
import { randomInt } from "node:crypto";
import { Command, NypsiCommandInteraction } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { Item } from "../types/Economy";
import { RaceDetails, RaceUserDetails } from "../types/StreetRace";
import { addProgress } from "../utils/functions/economy/achievements";
import { calcMaxBet, getBalance, updateBalance } from "../utils/functions/economy/balance";
import { getInventory } from "../utils/functions/economy/inventory";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { createUser, formatBet, getItems, userExists } from "../utils/functions/economy/utils";
import { getPrefix } from "../utils/functions/guilds/utils";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("streetrace", "create or join a street race", "money").setAliases(["sr"]);

cmd.slashEnabled = true;
cmd.slashData
  .addSubcommand((start) =>
    start
      .setName("start")
      .setDescription("start a race")
      .addIntegerOption((option) =>
        option
          .setName("bet")
          .setDescription("this is the bet and the entry fee for the race")
          .setRequired(true),
      ),
  )
  .addSubcommand((join) =>
    join
      .setName("join")
      .setDescription(
        "join an existing race in the channel (you will need a car, or you can use the bicycle)",
      )
      .addStringOption((option) =>
        option
          .setName("car")
          .setDescription("what car would you like to use")
          .setAutocomplete(true),
      ),
  );

const races = new Map<string, RaceDetails>();
const carCooldown = new Map<string, string[]>();

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

  const prefix = await getPrefix(message.guild);

  const help = () => {
    const embed = new CustomEmbed(message.member).setHeader("street race");

    embed.setDescription(
      `${prefix}**sr start <entry fee>** *start a street race*\n` +
        `${prefix}**sr join** *join a street race in the current channel*`,
    );

    return send({ embeds: [embed] });
  };

  if (args.length == 0) {
    return help();
  } else if (args[0].toLowerCase() == "start") {
    if (await onCooldown(cmd.name, message.member)) {
      const embed = await getResponse(cmd.name, message.member);

      return send({ embeds: [embed] });
    }

    if (args.length == 1) {
      return send({
        embeds: [new ErrorEmbed(`${prefix}sr start <entry fee> (speed limit)`)],
      });
    }

    if (races.has(message.channel.id)) {
      return send({
        embeds: [new ErrorEmbed("there is already a street race in this channel")],
      });
    }

    const bet = await formatBet(args[1], message.member);

    if (!bet) {
      return send({ embeds: [new ErrorEmbed("invalid bet")] });
    }

    if (isNaN(bet)) {
      return send({ embeds: [new ErrorEmbed("invalid bet")] });
    }

    if (bet <= 0) {
      return send({
        embeds: [new ErrorEmbed(`${prefix}sr start <entry fee> (speed limit)`)],
      });
    }

    if (bet < 1000) {
      return send({ embeds: [new ErrorEmbed("entry fee cannot be less than $1k")] });
    }

    let speedLimit = 7;

    if (args[2]) {
      if (!parseInt(args[2]) && parseInt(args[2]) != 0) {
        return send({ embeds: [new ErrorEmbed("speed limit must be a number 0-6")] });
      }
      speedLimit = parseInt(args[2]);

      if (!speedLimit && speedLimit != 0) {
        return send({ embeds: [new ErrorEmbed("invalid speed limit")] });
      }

      if (speedLimit > 7 || speedLimit < 0) {
        return send({ embeds: [new ErrorEmbed("speed limit must be a number 0-6")] });
      }
    }

    if (message.channel.isThread()) {
      return send({ embeds: [new ErrorEmbed("invalid channel")] });
    }

    if (message.channel.isDMBased()) return;

    if (message.channel.isVoiceBased())
      return send({ embeds: [new ErrorEmbed("invalid channel")] });

    if (message.channel.type != ChannelType.GuildText) return;

    await addCooldown(cmd.name, message.member, 180);

    const id = Math.random();

    const embed = new CustomEmbed(message.member).setHeader(
      `${message.author.username}'s street race`,
      message.author.avatarURL(),
    );

    embed.setFooter({ text: `use ${prefix}sr join to join` });

    embed.setDescription(
      `no racers\n\nentry fee: $${bet.toLocaleString()}${
        speedLimit != 7 ? `\nspeed limit: ${speedLimit}` : ""
      }`,
    );

    let msg = await send({ embeds: [embed] });

    const usersMap = new Map<string, RaceUserDetails>();

    const game = {
      channel: message.channel,
      users: usersMap,
      bet: bet,
      message: msg,
      id: id,
      start: new Date().getTime() + 30000,
      embed: embed,
      started: false,
      speedLimit: speedLimit,
    };

    races.set(message.channel.id, game);

    setTimeout(async () => {
      if (!races.has(message.channel.id)) return;
      if (races.get(message.channel.id).id != id) return;
      if (races.get(message.channel.id).users.size < 2) {
        embed.setDescription("race cancelled ):");
        embed.setFooter({ text: "race cancelled" });
        msg.edit({ embeds: [embed] }).catch(() => {});

        for (const u of races.get(message.channel.id).users.keys()) {
          const user = races.get(message.channel.id).users.get(u);

          await updateBalance(user.user.id, (await getBalance(user.user.id)) + bet);
        }
        races.delete(message.channel.id);
      } else {
        if (races.get(message.channel.id).started) return;
        await msg.delete().catch(() => {});
        msg = await message.channel.send({ embeds: [embed] });
        startRace(message.channel.id);
        const d = races.get(message.channel.id);
        d.started = true;
        d.message = msg;
        races.set(message.channel.id, d);
        setTimeout(() => {
          if (races.has(message.channel.id) && races.get(message.channel.id).id == id) {
            races.delete(message.channel.id);
          }
        }, 300000);
      }
    }, 30000);
  } else if (args[0].toLowerCase() == "join") {
    if (!races.get(message.channel.id)) {
      return send({
        embeds: [new ErrorEmbed("there is currently no street race in this channel")],
      });
    }

    if (races.get(message.channel.id).users.has(message.author.id)) {
      return;
    }

    if (races.get(message.channel.id).started) {
      return send({ embeds: [new ErrorEmbed("this race has already started")] });
    }

    const race = races.get(message.channel.id);

    if (race.bet > (await getBalance(message.member))) {
      return send({ embeds: [new ErrorEmbed("you cant afford the entry fee")] });
    }

    if (race.bet > (await calcMaxBet(message.member)) * 10)
      return send({
        embeds: [
          new ErrorEmbed(
            `your max bet is $**${((await calcMaxBet(message.member)) * 10).toLocaleString()}**`,
          ),
        ],
      });

    const items = getItems();
    const inventory = await getInventory(message.member);

    let car: Item;
    let cycle = false;

    if (args.length == 1) {
      for (const item of inventory) {
        if (items[item.item].role == "car") {
          if (
            inventory.find((i) => i.item == item.item) &&
            inventory.find((i) => i.item == item.item).amount > 0
          ) {
            if (car) {
              if (car.speed < items[item.item].speed) {
                if (carCooldown.has(message.author.id)) {
                  const current = carCooldown.get(message.author.id);
                  if (current.includes(items[item.item].id)) continue;
                }
                car = items[item.item];
              }
            } else {
              if (carCooldown.has(message.author.id)) {
                const current = carCooldown.get(message.author.id);
                if (current.includes(items[item.item].id)) continue;
              }
              car = items[item.item];
            }
          }
        }
      }
      if (!car) cycle = true;
    } else {
      let carName: string;

      const searchTag = args[1].toLowerCase();
      for (const itemName of Array.from(Object.keys(items))) {
        if (items[itemName].role != "car") continue;
        const aliases = items[itemName].aliases ? items[itemName].aliases : [];
        if (searchTag == itemName) {
          carName = itemName;
          break;
        } else if (searchTag == itemName.split("_").join("")) {
          carName = itemName;
          break;
        } else if (aliases.indexOf(searchTag) != -1) {
          carName = itemName;
          break;
        }
      }

      if (!carName) {
        return send({ embeds: [new ErrorEmbed(`couldnt find \`${args[1]}\``)] });
      } else {
        car = items[carName];
      }

      if (
        (!inventory.find((i) => i.item == car.id) ||
          inventory.find((i) => i.item == car.id).amount == 0) &&
        car.id != "cycle"
      ) {
        return send({ embeds: [new ErrorEmbed(`you don't have ${car.article} ${car.name}`)] });
      }
    }

    if (cycle) {
      car = items["cycle"];
    }

    if (race.speedLimit != 7 && car.speed > race.speedLimit) {
      return send({
        embeds: [
          new ErrorEmbed(
            `your ${car.name} is too fast for this race, select another with ${prefix}**sr join <car>**`,
          ),
        ],
      });
    }

    if (carCooldown.has(message.author.id) && car.id !== "cycle") {
      let current = carCooldown.get(message.author.id);

      if (current.includes(car.id)) {
        return send({
          embeds: [
            new ErrorEmbed(
              `your ${car.name} is on cooldown, select another with ${prefix}**sr join <car>**`,
            ),
          ],
        });
      } else {
        current.push(car.id);
        if (car.id != "cycle") {
          carCooldown.set(message.author.id, current);

          setTimeout(() => {
            current = carCooldown.get(message.author.id);
            current.splice(current.indexOf(car.id), 1);

            if (current.length == 0) {
              carCooldown.delete(message.author.id);
            } else {
              carCooldown.set(message.author.id, current);
            }
          }, 300000);
        }
      }
    } else {
      if (car.id != "cycle") {
        carCooldown.set(message.author.id, [car.id]);

        setTimeout(() => {
          const current = carCooldown.get(message.author.id);
          current.splice(current.indexOf(car.id), 1);

          if (current.length == 0) {
            carCooldown.delete(message.author.id);
          } else {
            carCooldown.set(message.author.id, current);
          }
        }, 120000);
      }
    }

    await updateBalance(message.member, (await getBalance(message.member)) - race.bet);

    race.users.set(message.author.id, {
      user: message.author,
      car: car,
      position: 0,
    });

    const embed = race.embed;

    let description = "";

    for (const u of race.users.keys()) {
      const user = race.users.get(u);

      description += `\n${user.car.emoji}\\_\\_\\_\\_\\_\\_\\_\\_\\_ 🏁 \`${user.user.username}\``;
    }

    const speedLimit = race.speedLimit;

    description += `\n\nentry fee: $${race.bet.toLocaleString()}${
      speedLimit != 7 ? `\nspeed limit: ${speedLimit}` : ""
    }`;

    embed.setDescription(description);

    await race.message.edit({ embeds: [embed] });

    if (!(message instanceof Message)) {
      await send({
        embeds: [new CustomEmbed(message.member, "you have joined the race")],
      }).then((m) =>
        setTimeout(() => {
          m.delete();
        }, 3000),
      );
    } else {
      await message.react("✅");

      setTimeout(async () => {
        await message.delete().catch(() => {});
      }, 1500);
    }

    if (race.users.size >= 25) {
      race.started = true;
      const id = races.get(message.channel.id).id;
      setTimeout(() => {
        if (races.has(message.channel.id) && races.get(message.channel.id).id == id) {
          races.delete(message.channel.id);
        }
      }, 300000);
      return startRace(message.channel.id);
    }
  }
}

cmd.setRun(run);

module.exports = cmd;

function getNewPosition(current: number, speed: number) {
  const randomness = randomInt(-4, 8);

  const movement = speed + randomness;

  if (current + movement < current) return current;

  return current + movement;
}

function getRacePosition(emoji: string, position: number) {
  let racePos = Math.floor(position / 5);

  if (racePos > 9) racePos = 9;

  let line = "";
  let underscores = 0;

  for (underscores; underscores < racePos; underscores++) {
    line += "\\_";
  }

  line += emoji;

  for (underscores; underscores < 9; underscores++) {
    line += "\\_";
  }

  return line;
}

async function startRace(id: string) {
  const race = races.get(id);

  let winner;

  for (const u of race.users.keys()) {
    const user = race.users.get(u);

    const newPos = getNewPosition(user.position, user.car.speed);

    user.position = newPos;

    race.users.set(user.user.id, user);

    if (newPos >= 50) {
      winner = user.user;
      break;
    }
  }

  const embed: CustomEmbed = race.embed;

  let description = "";

  for (const u of race.users.keys()) {
    const user = race.users.get(u);

    description += `\n${getRacePosition(user.car.emoji, user.position)} 🏁 \`${
      user.user.username
    }\``;
  }

  embed.setDescription(description);
  embed.setFooter({ text: "race has started" });

  await race.message.edit({ embeds: [embed] }).catch(() => {});

  races.set(id, race);

  if (winner) {
    const winnings = race.bet * race.users.size;

    await updateBalance(winner.id, (await getBalance(winner.id)) + race.bet * race.users.size);
    addProgress(winner.id, "racer", 1);
    addTaskProgress(winner.id, "vin_diesel");

    description +=
      `\n\n**${winner.username}** has won with their ${race.users.get(winner.id).car.name} ${
        race.users.get(winner.id).car.emoji
      }\n` + `+$${winnings.toLocaleString()}`;

    embed.setDescription(description);
    embed.setFooter({ text: "race has ended" });

    return setTimeout(async () => {
      await race.message.edit({ embeds: [embed] }).catch(() => {});
      return races.delete(id);
    }, 500);
  }

  setTimeout(() => {
    return startRace(id);
  }, 1000);
}
