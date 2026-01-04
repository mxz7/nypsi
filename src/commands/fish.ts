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
import { addBalance } from "../utils/functions/economy/balance";
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
  isGem,
  itemExists,
  removeInventoryItem,
} from "../utils/functions/economy/inventory";
import { addStat } from "../utils/functions/economy/stats";
import { addTaskProgress } from "../utils/functions/economy/tasks";
import { createUser, getItems, userExists } from "../utils/functions/economy/utils";
import { addXp, calcEarnedHFMXp } from "../utils/functions/economy/xp";
import { percentChance } from "../utils/functions/random";
import { addCooldown, getResponse, onCooldown } from "../utils/handlers/cooldownhandler";

const cmd = new Command("fish", "go to a pond and fish", "money");

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

  let fishingRod: string;

  if (inventory.has("incredible_fishing_rod")) {
    fishingRod = "incredible_fishing_rod";
  } else if (inventory.has("fishing_rod")) {
    fishingRod = "fishing_rod";
  } else if (inventory.has("terrible_fishing_rod")) {
    fishingRod = "terrible_fishing_rod";
  }

  if (!fishingRod) {
    return send({
      embeds: [
        new ErrorEmbed(
          "you need a fishing rod to fish\n[how do i get a fishing rod?](https://nypsi.xyz/docs/economy/fish-hunt-mine?ref=bot-help)",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  await addCooldown(cmd.name, member, 60);

  const fishItems = [
    "nothing",
    "nothing",
    "nothing",
    "nothing",
    "nothing",
    "nothing",
    "nothing",
    "nothing",
    "nothing",
    "nothing",
    "nothing",
    "nothing",
    "nothing",
    "nothing",
    "nothing",
    "nothing",
    "nothing",
    "nothing",
  ];

  for (const i of Array.from(Object.keys(items))) {
    if (["booster", "car", "tool", "prey", "sellable", "ore"].includes(items[i].role)) continue;
    if (items[i].id == "crystal_heart") continue;
    if (items[i].id.includes("credit")) continue;
    if (items[i].role === "worker-upgrade" && !percentChance(20)) continue;
    if (items[i].role == "crate" && !percentChance(35)) continue;
    if (items[i].id.includes("gem") && !percentChance(0.77)) continue;
    if (items[i].unique && (await itemExists(i))) continue;

    if (
      [
        "cobblestone",
        "iron_ore",
        "gold_ore",
        "coal",
        "iron_ingot",
        "gold_ingot",
        "obsidian",
        "netherrack",
        "quartz",
        "ancient_debris",
        "netherite_scrap",
        "netherite_ingot",
      ].includes(items[i].id)
    )
      continue;
    fishItems.push(i);

    if (items[i].role === "fish") fishItems.push(i);
  }

  await addStat(member, fishingRod);

  let times = 1;

  if (fishingRod == "fishing_rod") {
    times = 2;
  } else if (fishingRod == "incredible_fishing_rod") {
    times = 3;
  }

  const boosters = await getBoosters(member);

  let unbreaking = false;

  for (const boosterId of boosters.keys()) {
    if (items[boosterId].boosterEffect.boosts.includes("fish")) {
      if (items[boosterId].id == "unbreaking") {
        unbreaking = true;
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
    await removeInventoryItem(member, fishingRod, 1);
  }

  const user = await message.client.users.fetch(message.member.user.id);

  const embed = new CustomEmbed(member).setHeader(
    user.username,
    user.avatarURL(),
    `https://nypsi.xyz/users/${user.id}?ref=bot-fish`,
  );

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId("fish").setLabel("fish").setStyle(ButtonStyle.Success),
  );

  const foundItems = new Map<string, number>();

  for (let i = 0; i < times; i++) {
    const fishItemsModified = [];

    for (const i of fishItems) {
      if (items[i]) {
        if (items[i].rarity == 4) {
          const chance = Math.floor(Math.random() * 15);
          if (chance == 4 && fishingRod == "incredible_fishing_rod") {
            if (items[i].role == "fish") {
              for (let x = 0; x < 150; x++) {
                fishItemsModified.push(i);
              }
            }
            fishItemsModified.push(i);
          }
        } else if (items[i].rarity == 3) {
          const chance = Math.floor(Math.random() * 3);
          if (chance == 2 && fishingRod != "terrible_fishing_rod") {
            if (items[i].role == "fish") {
              for (let x = 0; x < 180; x++) {
                fishItemsModified.push(i);
              }
            }
            fishItemsModified.push(i);
          }
        } else if (items[i].rarity == 2 && fishingRod != "terrible_fishing_rod") {
          if (items[i].role == "fish") {
            for (let x = 0; x < 200; x++) {
              fishItemsModified.push(i);
            }
          } else if (items[i].role == "worker-upgrade") {
            const chance = Math.floor(Math.random() * 10);

            if (chance == 7) {
              fishItemsModified.push(i);
            }
          } else {
            fishItemsModified.push(i);
          }
        } else if (items[i].rarity == 1) {
          if (items[i].role == "fish") {
            for (let x = 0; x < 280; x++) {
              fishItemsModified.push(i);
            }
          } else if (items[i].role == "worker-upgrade") {
            const chance = Math.floor(Math.random() * 10);

            if (chance == 7) {
              for (let x = 0; x < 2; x++) {
                fishItemsModified.push(i);
              }
            }
          } else {
            for (let x = 0; x < 2; x++) {
              fishItemsModified.push(i);
            }
          }
        } else if (items[i].rarity == 0 && fishingRod != "incredible_fishing_rod") {
          if (items[i].role == "fish") {
            for (let x = 0; x < 400; x++) {
              fishItemsModified.push(i);
            }
          } else {
            fishItemsModified.push(i);
          }
        }
      } else {
        fishItemsModified.push(i);
        fishItemsModified.push(i);
      }
    }

    const chosen = fishItemsModified[Math.floor(Math.random() * fishItemsModified.length)];

    if (chosen == "nothing") continue;

    if (chosen.includes("money:") || chosen.includes("xp:")) {
      if (chosen.includes("money:")) {
        const amount = parseInt(chosen.substring(6));

        addStat(member, "earned-fish", amount);
        await addBalance(member, amount);
        foundItems.set(
          "money",
          foundItems.has("money") ? foundItems.get("money") + amount : amount,
        );
      } else if (chosen.includes("xp:")) {
        const amount = parseInt(chosen.substring(3));

        await addXp(member, amount);
        foundItems.set("xp", foundItems.has("xp") ? foundItems.get("xp") + amount : amount);
      }
    } else if (items[chosen]?.role == "fish") {
      let amount = 1;

      if (fishingRod == "terrible_fishing_rod" && items[chosen].rarity == 0) {
        amount = Math.floor(Math.random() * 1) + 1;
      } else if (fishingRod == "fishing_rod" && items[chosen].rarity < 2) {
        amount = Math.floor(Math.random() * 2) + 1;
      } else if (fishingRod == "incredible_fishing_rod") {
        amount = Math.floor(Math.random() * 3) + 1;
      }

      await addInventoryItem(member, chosen, amount);

      foundItems.set(chosen, foundItems.has(chosen) ? foundItems.get(chosen) + amount : amount);
    } else {
      let amount = 1;

      if (chosen == "terrible_fishing_rod" || chosen == "terrible_gun") {
        amount = 5;
      } else if (chosen == "fishing_rod" || chosen == "gun") {
        amount = 10;
      } else if (chosen == "incredible_fishing_rod" || chosen == "incredible_gun") {
        amount = 10;
      }

      await addInventoryItem(member, chosen, amount);

      if (isGem(chosen)) await addProgress(member, "gem_hunter", amount);

      foundItems.set(chosen, foundItems.has(chosen) ? foundItems.get(chosen) + amount : amount);
    }
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
    embed.setFooter({
      text: `+${foundItems.has("xp") ? foundItems.get("xp") + earnedXp : earnedXp}xp`,
    });
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
    total,
  );

  let eventData: EventData;

  if (eventProgress) {
    eventData = await getCurrentEvent();
  }

  embed.setDescription(
    `you go to the pond and cast your **${items[fishingRod].name}**\n\nyou caught${
      total > 0
        ? `: \n${Array.from(foundItems.entries())
            .map((i) => `- \`${i[1]}x\` ${items[i[0]].emoji} ${items[i[0]].name}`)
            .join("\n")}`
        : " **nothing**"
    }`,
  );

  if (eventProgress) {
    embed.addField("event progress", formatEventProgress(eventData, eventProgress, message.member));
  }

  send({ embeds: [embed], components: [row] });

  addProgress(message.member, "fisher", total);
  await addTaskProgress(message.member, "fish_daily");
  await addTaskProgress(message.member, "fish_weekly");
}

cmd.setRun(run);

module.exports = cmd;
