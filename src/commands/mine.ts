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
import { addEventProgress, EventData, getCurrentEvent } from "../utils/functions/economy/events";
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

const veins = new Map<string, number[]>();

veins.set("cobblestone", [5, 7, 15, 25]);
veins.set("coal", [2, 4, 5, 8, 16]);
veins.set("iron_ore", [1, 3, 7]);
veins.set("gold_ore", [1, 2, 4]);
veins.set("diamond", [1, 2]);
veins.set("amethyst", [1, 2, 3]);
veins.set("netherrack", [5, 7, 15, 25]);
veins.set("gold_nugget", [2, 8, 12, 18, 28]);
veins.set("quartz", [1, 4, 6, 12]);
veins.set("end_stone", [5, 7, 15, 25]);
veins.set("purpur", [2, 8, 12, 14]);
veins.set("chorus", [2, 8, 12, 14]);

const areas = [
  "cave",
  "mineshaft",
  "strip mine",
  "1x1 hole you dug",
  "staircase to bedrock",
  "nether",
  "nether",
  "nether",
  "end",
];

const cmd = new Command("mine", "go to a cave and mine", "money").setDocs(
  "https://nypsi.xyz/docs/economy/fish-hunt-mine?ref=bot-help",
);

cmd.slashEnabled = true;

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

  let pickaxe: string;

  if (inventory.has("diamond_pickaxe")) {
    pickaxe = "diamond_pickaxe";
  } else if (inventory.has("iron_pickaxe")) {
    pickaxe = "iron_pickaxe";
  } else if (inventory.has("wooden_pickaxe")) {
    pickaxe = "wooden_pickaxe";
  }

  if (!pickaxe) {
    return send({
      embeds: [
        new ErrorEmbed(
          "you need a pickaxe to mine\n[how do i get a pickaxe?](https://nypsi.xyz/docs/economy/fish-hunt-mine?ref=bot-help)",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  await addCooldown(cmd.name, member, 60);

  await addStat(member, pickaxe);

  const mineItems = Array.from(Object.keys(items));

  const boosters = await getBoosters(member);

  let times = 1;
  let multi = 0;
  let unbreakable = false;

  if (pickaxe == "iron_pickaxe") {
    times = 2;
  } else if (pickaxe == "diamond_pickaxe") {
    times = 3;
  }

  for (let i = 0; i < 20; i++) {
    mineItems.push("nothing");
  }

  for (const boosterId of boosters.keys()) {
    if (items[boosterId].role == "booster") {
      if (items[boosterId].boosterEffect.boosts.includes("mine")) {
        let chance: number;
        switch (items[boosterId].id) {
          case "fortune":
            for (let i = 0; i < boosters.get(boosterId).length; i++) {
              chance = Math.floor(Math.random() * 5);
              if (chance > 1) {
                multi += items[boosterId].boosterEffect.effect;
              }
            }
            break;
          case "efficiency":
            for (let i = 0; i < boosters.get(boosterId).length; i++) {
              chance = Math.floor(Math.random() * 5);
              if (chance > 1) {
                times += items[boosterId].boosterEffect.effect;
              }
            }
            break;
          case "unbreaking":
            unbreakable = true;
            break;
        }
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

  if (!unbreakable) {
    await removeInventoryItem(member, pickaxe, 1);
  }

  let chosenArea: string;

  const choseArea = (): string => {
    chosenArea = areas[Math.floor(Math.random() * areas.length)];

    if (chosenArea == "nether") {
      if (!inventory.has("nether_portal")) {
        return choseArea();
      }
    } else if (chosenArea === "end") {
      if (!inventory.has("end_portal")) {
        return choseArea();
      }
    }

    return chosenArea;
  };

  chosenArea = choseArea();

  const user = await message.client.users.fetch(message.member.user.id);

  const embed = new CustomEmbed(member).setHeader(
    user.username,
    user.avatarURL(),
    `https://nypsi.xyz/users/${user.id}?ref=bot-mine`,
  );

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("mine").setLabel("mine").setStyle(ButtonStyle.Success),
  );

  if (chosenArea == "nether") await addStat(member, "nether_portal");
  else if (chosenArea === "end") await addStat(member, "end_portal");

  const foundItems = new Map<string, number>();

  for (let i = 0; i < times; i++) {
    const mineItemsModified = [];

    for (const i of mineItems) {
      if (items[i]) {
        if (chosenArea == "nether") {
          if (!["netherrack", "ancient_debris", "quartz", "gold_nugget"].includes(items[i].id))
            continue;
        } else if (chosenArea === "end") {
          if (!["end_stone", "purpur", "obsidian", "dragon_egg", "chorus"].includes(items[i].id))
            continue;
        } else {
          if (
            ![
              "cobblestone",
              "coal",
              "diamond",
              "amethyst",
              "emerald",
              "iron_ore",
              "gold_ore",
              "obsidian",
              "mineshaft_chest",
            ].includes(items[i].id)
          )
            continue;

          if (items[i].id == "mineshaft_chest" && chosenArea != "mineshaft") continue;
        }

        if (items[i].id == "ancient_debris") {
          if (pickaxe != "diamond_pickaxe") continue;

          const chance = Math.floor(Math.random() * 5);

          if (chance >= 2) continue;
        }

        if (items[i].rarity == 4) {
          const chance = Math.floor(Math.random() * 6);
          if (chance == 1 && pickaxe == "diamond_pickaxe") {
            for (let x = 0; x < 10; x++) {
              mineItemsModified.push(i);
            }
          }
        } else if (items[i].rarity == 3) {
          if (pickaxe == "wooden_pickaxe" && items[i].id != "mineshaft_chest") continue;

          if (items[i].id == "mineshaft_chest") {
            for (let x = 0; x < 3; x++) {
              mineItemsModified.push(i);
            }
          } else {
            for (let x = 0; x < 10; x++) {
              mineItemsModified.push(i);
            }
          }
        } else if (items[i].rarity == 2 && pickaxe != "wooden_pickaxe") {
          for (let x = 0; x < 15; x++) {
            mineItemsModified.push(i);
          }
        } else if (items[i].rarity == 1 && pickaxe != "wooden_pickaxe") {
          for (let x = 0; x < 20; x++) {
            mineItemsModified.push(i);
          }
        } else if (items[i].rarity == 0) {
          if (pickaxe == "diamond_pickaxe" && chosenArea != "nether") {
            for (let x = 0; x < 7; x++) {
              mineItemsModified.push(i);
            }
          } else {
            for (let x = 0; x < 50; x++) {
              mineItemsModified.push(i);
            }
          }
        }
      }
    }

    const chosen = mineItemsModified[Math.floor(Math.random() * mineItemsModified.length)];

    if (chosen == "nothing") continue;

    let amount = 1;

    if (veins.has(chosen)) {
      amount = veins.get(chosen)[Math.floor(Math.random() * veins.get(chosen).length)];

      if (multi > 0) {
        amount += amount * multi;
        amount = Math.floor(amount);
        if (amount > 64) amount = 64;
      }
    }

    await addInventoryItem(member, chosen, amount);

    foundItems.set(chosen, foundItems.has(chosen) ? foundItems.get(chosen) + amount : amount);
  }

  if (!unbreakable && percentChance(0.65)) {
    foundItems.set("stick", 1);
    await addInventoryItem(member, "stick", 1);
  }

  let total = 0;

  try {
    total = Array.from(foundItems.entries())
      .map((i) => (["money", "xp"].includes(i[0]) ? 0 : i[1]))
      .reduce((a, b) => a + b);
  } catch {
    total = 0;
  }

  const earnedXp = Math.floor((await calcEarnedHFMXp(member, total)) / 2);

  if (earnedXp > 0) {
    embed.setFooter({ text: `+${earnedXp.toLocaleString()}xp` });
    await addXp(member, earnedXp);

    const guild = await getGuildName(member);

    if (guild) {
      await addToGuildXP(guild, earnedXp, member);
    }
  }

  const eventProgress = await addEventProgress(
    message.client as NypsiClient,
    message.member,
    "grind",
    1,
  );

  const eventData: { event?: EventData; target: number } = { target: 0 };

  if (eventProgress) {
    eventData.event = await getCurrentEvent();

    if (eventData.event) {
      eventData.target = Number(eventData.event.target);
    }
  }

  embed.setDescription(
    `you go to the ${chosenArea} and swing your **${items[pickaxe].name}**\n\nyou found${
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
      `🔱 ${eventProgress.toLocaleString()}/${eventData.target.toLocaleString()}`,
    );
  }

  send({ embeds: [embed], components: [row] });

  addProgress(message.member, "miner", total);
  await addTaskProgress(message.member, "mine_daily");
  await addTaskProgress(message.member, "mine_weekly");
}

cmd.setRun(run);

module.exports = cmd;
