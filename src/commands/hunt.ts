import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CommandInteraction,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import { NypsiClient } from "../models/Client";
import { Command, NypsiCommandInteraction, NypsiMessage, SendMessage } from "../models/Command";
import { CustomEmbed, ErrorEmbed } from "../models/EmbedBuilders";
import { addProgress } from "../utils/functions/economy/achievements";
import { getBoosters } from "../utils/functions/economy/boosters";
import {
  addEventProgress,
  EventData,
  formatEventProgress,
  getCurrentEvent,
} from "../utils/functions/economy/events";
import { addToGuildXP, getGuildName } from "../utils/functions/economy/guilds";
import {
  addInventoryItem,
  gemBreak,
  getInventory,
  removeInventoryItem,
} from "../utils/functions/economy/inventory";
import { addStat } from "../utils/functions/economy/stats";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { addXp, calcEarnedHFMXp } from "../utils/functions/economy/xp";
import { percentChance } from "../utils/functions/random";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";
import { logger } from "../utils/logger";

const cmd = new Command("hunt", "go to a field and hunt", "money");

cmd.slashEnabled = true;

const places = [
  "field",
  "forest",
  "african plains",
  "amazon rainforest",
  "field",
  "forest",
  "field",
  "forest",
  "field",
  "forest",
  "nether",
];

async function run(
  message: NypsiMessage | (NypsiCommandInteraction & CommandInteraction) | ButtonInteraction,
  send: SendMessage,
) {
  const member = await message.guild.members.fetch(message.member.user.id);

  if (!(await userExists(member))) await createUser(member);

  if (await onCooldown(cmd.name, member)) {
    const res = await getResponse(cmd.name, member);

    if (res.respond) send({ embeds: [res.embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const inventory = await getInventory(member);
  const items = getItems();

  let gun: string;

  if (inventory.has("incredible_gun")) {
    gun = "incredible_gun";
  } else if (inventory.has("gun")) {
    gun = "gun";
  } else if (inventory.has("terrible_gun")) {
    gun = "terrible_gun";
  }

  if (!gun) {
    return send({
      embeds: [
        new ErrorEmbed(
          "you need a gun to hunt\n[how do i get a gun?](https://nypsi.xyz/docs/economy/fish-hunt-mine?ref=bot-help)\n\nyou can use **/free** to get some basic tools",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  await addCooldown(cmd.name, member, 60);

  await addStat(member, gun);

  const huntItems = Array.from(Object.keys(items));

  let times = 1;
  let multi = 0;

  if (gun == "gun") {
    times = 2;
  } else if (gun == "incredible_gun") {
    times = 3;
  }

  const boosters = await getBoosters(member);
  let unbreaking = false;

  for (const boosterId of boosters.keys()) {
    if (items[boosterId].boosterEffect.boosts.includes("hunt")) {
      if (items[boosterId].id == "unbreaking") {
        unbreaking = true;
      } else if (items[boosterId].id == "looting") {
        for (let i = 0; i < boosters.get(boosterId).length; i++) {
          const chance = Math.floor(Math.random() * 5);
          if (chance > 2) {
            multi += items[boosterId].boosterEffect.effect;
          }
        }
      } else {
        times++;
      }
    }
  }

  if ((await inventory.hasGem("purple_gem")).any) {
    if (percentChance(0.2)) {
      gemBreak(message.member, 0.03, "purple_gem", message.client as NypsiClient);
      times++;
    }
  }
  if ((await inventory.hasGem("white_gem")).any) {
    if (percentChance(0.2)) {
      gemBreak(message.member, 0.03, "white_gem", message.client as NypsiClient);
      times++;
    }
  }
  if ((await inventory.hasGem("crystal_heart")).any) {
    if (percentChance(0.1)) {
      times++;
    }
  }

  if (!unbreaking) {
    await removeInventoryItem(member, gun, 1);
  }

  let chosenPlace: string;

  const choseArea = (): string => {
    chosenPlace = places[Math.floor(Math.random() * places.length)];

    if (chosenPlace == "nether") {
      if (!inventory.has("nether_portal")) {
        return choseArea();
      }
    }

    return chosenPlace;
  };

  chosenPlace = choseArea();

  const user = await message.client.users.fetch(message.member.user.id);

  const embed = new CustomEmbed(member).setHeader(
    user.username,
    user.avatarURL(),
    `https://nypsi.xyz/users/${user.id}?ref=bot-hunt`,
  );

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("hunt").setLabel("hunt").setStyle(ButtonStyle.Success),
  );

  for (let i = 0; i < 10; i++) {
    huntItems.push("nothing");
  }

  const foundItems = new Map<string, number>();

  for (let i = 0; i < times; i++) {
    const huntItemsModified = [];

    for (const i of huntItems) {
      if (items[i]) {
        if (items[i].role != "prey") continue;
        if (chosenPlace === "nether") {
          if (!["blaze", "wither_skeleton", "piglin", "ghast"].includes(i)) continue;
        } else {
          if (["blaze", "wither_skeleton", "piglin", "ghast"].includes(i)) continue;
        }
        if (items[i].rarity === 5) {
          const chance = Math.floor(Math.random() * 30);
          if (chance == 7 && gun == "incredible_gun") {
            for (let x = 0; x < Math.floor(Math.random() * 10); x++) {
              huntItemsModified.push(i);
            }
          }
        } else if (items[i].rarity == 4) {
          const chance = Math.floor(Math.random() * 15);
          if (chance == 4 && gun == "incredible_gun") {
            for (let x = 0; x < 4; x++) {
              huntItemsModified.push(i);
            }
          }
        } else if (items[i].rarity == 3) {
          const chance = Math.floor(Math.random() * 3);
          if (chance == 2 && gun != "terrible_gun") {
            for (let x = 0; x < 4; x++) {
              huntItemsModified.push(i);
            }
          }
        } else if (items[i].rarity == 2 && gun != "terrible_gun") {
          for (let x = 0; x < 7; x++) {
            huntItemsModified.push(i);
          }
        } else if (items[i].rarity == 1) {
          for (let x = 0; x < 15; x++) {
            huntItemsModified.push(i);
          }
        } else if (items[i].rarity == 0) {
          if (gun == "incredible_gun") {
            for (let x = 0; x < 7; x++) {
              huntItemsModified.push(i);
            }
          } else {
            for (let x = 0; x < 25; x++) {
              huntItemsModified.push(i);
            }
          }
        }
      } else {
        huntItemsModified.push(i);
      }
    }

    const chosen = huntItemsModified[Math.floor(Math.random() * huntItemsModified.length)];

    if (chosen == "nothing") continue;

    let amount = 1;

    if (gun == "terrible_gun") {
      amount = Math.floor(Math.random() * 1) + 1;
    } else if (gun == "gun") {
      amount = Math.floor(Math.random() * 3) + 1;
    } else if (gun == "incredible_gun") {
      amount = Math.floor(Math.random() * 5) + 1;
    }

    if (multi > 0) {
      amount += amount * (Math.random() * multi);
      amount = Math.floor(amount);
    }

    await addInventoryItem(member, chosen, amount);

    if (!chosen) {
      console.error(chosen);
    }

    foundItems.set(chosen, foundItems.has(chosen) ? foundItems.get(chosen) + amount : amount);
  }

  let total = 0;

  try {
    total = Array.from(foundItems.entries())
      .map((i) => (["money", "xp"].includes(i[0]) ? 0 : i[1]))
      .reduce((a, b) => a + b);
  } catch {
    total = 0;
  }

  const earnedXp = await calcEarnedHFMXp(member, total);

  if (earnedXp > 0) {
    embed.setFooter({ text: `+${earnedXp.toLocaleString()}xp` });
    await addXp(member, earnedXp);

    const guild = await getGuildName(member);

    if (guild) {
      await addToGuildXP(guild, earnedXp, member);
    }
  }

  for (const i of foundItems.entries()) {
    if (!items[i[0]]) {
      logger.error("hunt error emoji thing");
      console.error(foundItems);
      console.error(huntItems);
    }
  }

  const eventProgress = await addEventProgress(
    message.client as NypsiClient,
    message.member,
    "grind",
    total,
  );

  let eventData: EventData;

  if (eventProgress) {
    eventData = await getCurrentEvent();
  }

  embed.setDescription(
    `you go to the ${chosenPlace} and prepare your **${items[gun].name}**\n\nyou killed${
      total > 0
        ? `: \n${Array.from(foundItems.entries())
            .map((i) => `- \`${i[1]}x\` ${items[i[0]].emoji} ${items[i[0]].name}`)
            .join("\n")}`
        : " **nothing**"
    }`,
  );

  if (eventProgress) {
    embed.addField(
      "event progress",
      formatEventProgress(eventData, eventProgress, message.member.user.id),
    );
  }

  send({ embeds: [embed], components: [row] });

  addProgress(message.member, "hunter", total);
  await addTaskProgress(message.member, "hunt_daily");
  await addTaskProgress(message.member, "hunt_weekly");
}

cmd.setRun(run);

module.exports = cmd;
