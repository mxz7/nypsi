import { randomUUID } from "crypto";
import { RESTPostAPIChannelMessageResult, Routes } from "discord-api-types/v10";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Message,
  MessageActionRowComponentBuilder,
  MessageFlags,
} from "discord.js";
import redis from "../../../init/redis";
import { NypsiClient } from "../../../models/Client";
import { CustomEmbed, ErrorEmbed } from "../../../models/EmbedBuilders";
import { LootPoolResult } from "../../../types/LootPool";
import { redisDeserialize, redisSerialize } from "../../cache";
import Constants from "../../Constants";
import { logger } from "../../logger";
import { getRest } from "../../rest";
import { getPrefix } from "../guilds/utils";
import { shuffle } from "../random";
import { getZeroWidth } from "../string";
import { createProfile, hasProfile } from "../users/utils";
import { addProgress } from "./achievements";
import { addEventProgress } from "./events";
import { markGemAsGiven } from "./gems";
import { isGem } from "./inventory";
import { describeLootPoolResult, giveLootPoolResult } from "./loot_pools";
import { addTaskProgress } from "./tasks";
import { createUser, isEcoBanned, userExists } from "./utils";

const dropDurationSeconds = 30;
const stateTtlSeconds = dropDurationSeconds + 15;
const words = [
  "nypsi",
  "nypsi best discord bot",
  "{prefix}boob",
  "{prefix}pp",
  "{prefix}bake",
  "{prefix}slots all",
  "{prefix}height",
  "{prefix}findamilf",
  "{prefix}cat",
  "{prefix}dog",
  "meow",
];

type LootDropGame = "fast-click" | "click-specific" | "type-fast";

type LootDropButton = {
  choice: string;
  emoji?: string;
  label?: string;
  style: ButtonStyle;
};

type ActiveLootDrop = {
  avatarUrl?: string;
  buttons?: LootDropButton[];
  channelId: string;
  chosenWord?: string;
  description: string;
  game: LootDropGame;
  id: string;
  messageId?: string;
  prize: LootPoolResult;
  rain?: string;
  startedAt: number;
  targetKind?: "button" | "emoji";
  targetName?: string;
  winningChoice?: string;
};

const stateKey = (dropId: string) => `${Constants.redis.nypsi.LOOT_DROP}:active:${dropId}`;
const claimKey = (dropId: string) => `${Constants.redis.nypsi.LOOT_DROP}:claim:${dropId}`;
const losersKey = (dropId: string) => `${Constants.redis.nypsi.LOOT_DROP}:losers:${dropId}`;
const channelKey = (channelId: string) => `${Constants.redis.nypsi.LOOT_DROP}:channel:${channelId}`;

async function getDrop(dropId: string): Promise<ActiveLootDrop | undefined> {
  const raw = await redis.get(stateKey(dropId));

  return raw ? redisDeserialize<ActiveLootDrop>(raw) : undefined;
}

async function saveDrop(drop: ActiveLootDrop) {
  await redis.set(stateKey(drop.id), redisSerialize(drop), "EX", stateTtlSeconds);
}

function getDropEmbed(drop: ActiveLootDrop, result?: string) {
  const embed = new CustomEmbed()
    .setColor(0xffffff)
    .setHeader("loot drop", drop.avatarUrl)
    .setDescription(drop.description + (result ? `\n\n${result}` : ""));

  if (drop.rain) embed.setFooter({ text: `${drop.rain}'s rain` });

  return embed;
}

function getDropComponents(drop: ActiveLootDrop, disabled = false) {
  if (!drop.buttons) return [];

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();

  for (const buttonData of drop.buttons) {
    const button = new ButtonBuilder()
      .setCustomId(`loot-drop:${drop.id}:${buttonData.choice}`)
      .setStyle(buttonData.style)
      .setDisabled(disabled);

    if (buttonData.emoji) button.setEmoji(buttonData.emoji);
    if (buttonData.label !== undefined) button.setLabel(buttonData.label || getZeroWidth());

    row.addComponents(button);
  }

  return [row];
}

async function updateDropMessage(drop: ActiveLootDrop, result: string) {
  if (!drop.messageId) return;

  await getRest()
    .patch(Routes.channelMessage(drop.channelId, drop.messageId), {
      body: {
        embeds: [getDropEmbed(drop, result)],
        components: getDropComponents(drop, true),
      },
    })
    .catch((error) =>
      logger.error("lootdrop: failed to update drop message", {
        channelId: drop.channelId,
        dropId: drop.id,
        error,
        messageId: drop.messageId,
      }),
    );
}

async function removeActiveDrop(drop: ActiveLootDrop) {
  await redis.srem(channelKey(drop.channelId), drop.id);
}

async function completeDrop(
  drop: ActiveLootDrop,
  client: NypsiClient,
  winnerId: string,
  winnerName: string,
) {
  if (!(await hasProfile(winnerId))) await createProfile(winnerId);
  if (!(await userExists(winnerId))) await createUser(winnerId);

  switch (drop.prize.item) {
    case "pumpkin":
      addEventProgress(client, winnerId, "halloween", drop.prize.count || 1);
      break;
    case "christmas_tree":
      addEventProgress(client, winnerId, "christmas", drop.prize.count || 1);
      break;
  }

  if (!drop.rain) {
    addProgress(winnerId, "lootdrops_pro", 1);
    addTaskProgress(winnerId, "lootdrops");
  }

  await giveLootPoolResult(winnerId, drop.prize, "random_drop");

  if (drop.prize.item && isGem(drop.prize.item)) await markGemAsGiven();

  const elapsed = ((Date.now() - drop.startedAt) / 1000).toFixed(2);
  const escapedWinnerName = winnerName.replaceAll("_", "\\_");

  await updateDropMessage(drop, `**${escapedWinnerName}** has won in \`${elapsed}s\`!!`);
  await removeActiveDrop(drop);

  logger.info(`lootdrop: ${winnerId} won a drop in ${drop.channelId}`, {
    channelId: drop.channelId,
    dropId: drop.id,
    prize: drop.prize,
    rain: drop.rain,
    winnerId,
  });
}

async function claimDrop(drop: ActiveLootDrop, winnerId: string) {
  const result = await redis.set(claimKey(drop.id), winnerId, "EX", stateTtlSeconds, "NX");

  return result === "OK";
}

async function isWinnerAllowed(userId: string, drop: ActiveLootDrop) {
  try {
    return !(await isEcoBanned(userId)).banned;
  } catch (error) {
    logger.error(`lootdrop: failed to check economy ban for ${userId}`, {
      channelId: drop.channelId,
      dropId: drop.id,
      error,
      userId,
    });
    return true;
  }
}

async function expireDrop(dropId: string) {
  const drop = await getDrop(dropId);
  if (!drop) return;

  const claimed = await redis.set(claimKey(drop.id), "timeout", "EX", stateTtlSeconds, "NX");

  if (claimed !== "OK") return;

  const result =
    drop.game === "type-fast" ? "nobody won 😢" : "nobody clicked the button in time 😢";

  await updateDropMessage(drop, result);
  await removeActiveDrop(drop);
}

function createFastClickDrop(
  client: NypsiClient,
  channelId: string,
  prize: LootPoolResult,
  rain?: string,
): ActiveLootDrop {
  return {
    avatarUrl: client.user.avatarURL(),
    buttons: [{ choice: "claim", label: "click me", style: ButtonStyle.Success }],
    channelId,
    description: `first to click the button wins ${describeLootPoolResult(prize)}`,
    game: "fast-click",
    id: randomUUID(),
    prize,
    rain,
    startedAt: Date.now(),
    winningChoice: "claim",
  };
}

async function createTypeFastDrop(
  client: NypsiClient,
  channelId: string,
  prize: LootPoolResult,
  rain?: string,
): Promise<ActiveLootDrop | undefined> {
  const channel = (await getRest()
    .get(Routes.channel(channelId))
    .catch((error) => {
      logger.error("lootdrop: failed to fetch drop channel", { channelId, error });
    })) as { guild_id?: string } | undefined;

  if (!channel?.guild_id) return;

  const chosenWord = words[Math.floor(Math.random() * words.length)].replace(
    "{prefix}",
    (await getPrefix(channel.guild_id))[0],
  );
  let displayWord = chosenWord;

  for (let i = 0; i < chosenWord.length / 2; i++) {
    const position = Math.floor(Math.random() * chosenWord.length + 1);
    displayWord =
      displayWord.substring(0, position) + getZeroWidth() + displayWord.substring(position);
  }

  return {
    avatarUrl: client.user.avatarURL(),
    channelId,
    chosenWord,
    description: `first to type \`${displayWord}\` wins ${describeLootPoolResult(prize)}`,
    game: "type-fast",
    id: randomUUID(),
    prize,
    rain,
    startedAt: Date.now(),
  };
}

function createClickSpecificDrop(
  client: NypsiClient,
  channelId: string,
  prize: LootPoolResult,
  rain?: string,
): ActiveLootDrop {
  type Choice = {
    emoji?: string;
    label?: string;
    name: string;
    style: ButtonStyle;
  };

  const types: { kind: "button" | "emoji"; values: Choice[] }[] = [
    {
      kind: "button" as const,
      values: [
        { name: "red", label: "", style: ButtonStyle.Danger },
        { name: "blue", label: "", style: ButtonStyle.Primary },
        { name: "green", label: "", style: ButtonStyle.Success },
        { name: "gray", label: "", style: ButtonStyle.Secondary },
      ],
    },
    ...[
      [
        ["laughing", "😂"],
        ["yum", "😋"],
        ["drooling", "🤤"],
        ["kissing", "😘"],
        ["sad", "☹️"],
      ],
      [
        ["angry", "😡"],
        ["shocked", "😮"],
        ["rich", "🤑"],
        ["cowboy", "🤠"],
        ["angel", "😇"],
      ],
      [
        ["angry", "😡"],
        ["cheeky", "🤭"],
        ["yummy", "😋"],
        ["heart", "🫶"],
        ["kissing", "😘"],
      ],
      [
        ["cheeky", "🤭"],
        ["white heart", "🤍"],
        ["bubbles", "🫧"],
        ["loved", "🥰"],
        ["eye rolling", "🙄"],
      ],
      [
        ["heart", "🫶"],
        ["sad", "😔"],
        ["spicy", "🌶️"],
        ["happy", "😃"],
        ["eye rolling", "🙄"],
      ],
      [
        ["detective", "🕵️‍♂️"],
        ["sponge", "🧽"],
        ["egg", "🍳"],
        ["otter", "🦦"],
        ["badminton", "🏸"],
      ],
    ].map((values) => ({
      kind: "emoji" as const,
      values: values.map(([name, emoji]) => ({
        emoji,
        name,
        style: ButtonStyle.Secondary,
      })),
    })),
  ];
  const chosenType = types[Math.floor(Math.random() * types.length)];
  const chosenValue = chosenType.values[Math.floor(Math.random() * chosenType.values.length)];
  const shuffledButtons = shuffle(chosenType.values).map((value, index) => ({
    choice: index.toString(),
    emoji: value.emoji,
    label: value.label,
    name: value.name,
    style: value.style,
  }));
  const winningChoice = shuffledButtons.find((button) => button.name === chosenValue.name)?.choice;
  const buttons = shuffledButtons.map(({ name: _, ...button }) => button);

  return {
    avatarUrl: client.user.avatarURL(),
    buttons,
    channelId,
    description: `first to click the **${chosenValue.name}** ${chosenType.kind} wins ${describeLootPoolResult(prize)}`,
    game: "click-specific",
    id: randomUUID(),
    prize,
    rain,
    startedAt: Date.now(),
    targetKind: chosenType.kind,
    targetName: chosenValue.name,
    winningChoice,
  };
}

export async function startLootDrop(
  client: NypsiClient,
  channelId: string,
  prize: LootPoolResult,
  rain?: string,
) {
  const game = Math.floor(Math.random() * 3);
  const drop =
    game === 0
      ? createFastClickDrop(client, channelId, prize, rain)
      : game === 1
        ? createClickSpecificDrop(client, channelId, prize, rain)
        : await createTypeFastDrop(client, channelId, prize, rain);

  if (!drop) return;

  await saveDrop(drop);

  let message: RESTPostAPIChannelMessageResult;

  try {
    message = (await getRest(client).post(Routes.channelMessages(channelId), {
      body: {
        embeds: [getDropEmbed(drop)],
        components: getDropComponents(drop),
      },
    })) as RESTPostAPIChannelMessageResult;
  } catch (error) {
    logger.error("lootdrop: failed to create drop message", {
      channelId,
      dropId: drop.id,
      error,
    });
    await redis.del(stateKey(drop.id)).catch((cleanupError) =>
      logger.error("lootdrop: failed to clean up unsent drop", {
        channelId,
        cleanupError,
        dropId: drop.id,
      }),
    );
    return;
  }

  drop.messageId = message.id;
  drop.startedAt = Date.now();
  await saveDrop(drop);

  if (drop.game === "type-fast") {
    await redis.sadd(channelKey(channelId), drop.id);
    await redis.expire(channelKey(channelId), stateTtlSeconds);
  }

  setTimeout(() => {
    expireDrop(drop.id).catch((error) =>
      logger.error("lootdrop: failed to expire drop", {
        channelId,
        dropId: drop.id,
        error,
      }),
    );
  }, dropDurationSeconds * 1000);
}

export async function handleLootDropInteraction(interaction: ButtonInteraction) {
  const [, dropId, choice] = interaction.customId.split(":");
  const drop = await getDrop(dropId);

  if (!drop || (drop.messageId && drop.messageId !== interaction.message.id)) {
    return interaction.reply({
      embeds: [new ErrorEmbed("too slow ):")],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!drop.messageId) {
    drop.messageId = interaction.message.id;
    await saveDrop(drop);
  }

  if (await redis.exists(claimKey(drop.id))) {
    return interaction.reply({
      embeds: [new ErrorEmbed("too slow ):")],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (drop.game === "click-specific" && choice !== drop.winningChoice) {
    await redis.sadd(losersKey(drop.id), interaction.user.id);
    await redis.expire(losersKey(drop.id), stateTtlSeconds);

    return interaction.reply({
      embeds: [
        new CustomEmbed(interaction.user.id)
          .setColor(Constants.EMBED_FAIL_COLOR)
          .setHeader("uh oh ):")
          .setDescription(
            `you clicked the wrong ${drop.targetKind}!! you had to click the **${drop.targetName}** ${drop.targetKind}`,
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (await redis.sismember(losersKey(drop.id), interaction.user.id)) {
    return interaction.reply({
      embeds: [new ErrorEmbed("you already clicked the wrong one")],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!(await isWinnerAllowed(interaction.user.id, drop))) {
    return interaction.reply({
      embeds: [new ErrorEmbed("you're banned don't even try loser")],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!(await claimDrop(drop, interaction.user.id))) {
    return interaction.reply({
      embeds: [new ErrorEmbed("too slow ):")],
      flags: MessageFlags.Ephemeral,
    });
  }

  const winEmbed = new CustomEmbed(interaction.user.id)
    .setColor(Constants.EMBED_SUCCESS_COLOR)
    .setHeader("you've won a loot drop!")
    .setDescription(`you've won ${describeLootPoolResult(drop.prize)}`);

  if (drop.rain) winEmbed.setFooter({ text: `${drop.rain}'s rain` });

  await interaction.reply({ embeds: [winEmbed], flags: MessageFlags.Ephemeral }).catch((error) =>
    logger.error("lootdrop: failed to send winner response", {
      channelId: drop.channelId,
      dropId: drop.id,
      error,
      winnerId: interaction.user.id,
    }),
  );

  try {
    await completeDrop(
      drop,
      interaction.client as NypsiClient,
      interaction.user.id,
      interaction.user.username,
    );
  } catch (error) {
    logger.error("lootdrop: failed to complete button drop", {
      channelId: drop.channelId,
      dropId: drop.id,
      error,
      winnerId: interaction.user.id,
    });
    await updateDropMessage(
      drop,
      "something went wrong with this lootdrop, please make a support ticket",
    );
    await removeActiveDrop(drop);
    await interaction.editReply({
      embeds: [new ErrorEmbed("something went wrong, please make a support ticket")],
    });
    return;
  }
}

export async function handleLootDropMessage(message: Message) {
  if (message.author.bot || !message.inGuild()) return;

  const dropIds = await redis.smembers(channelKey(message.channelId));
  if (dropIds.length === 0) return;

  const drops = (await Promise.all(dropIds.map(getDrop)))
    .filter((drop): drop is ActiveLootDrop => Boolean(drop))
    .filter(
      (drop) =>
        drop.game === "type-fast" &&
        message.content.toLowerCase() === drop.chosenWord?.toLowerCase(),
    )
    .sort((a, b) => a.startedAt - b.startedAt);
  const drop = drops[0];

  if (!drop || !(await isWinnerAllowed(message.author.id, drop))) return;
  if (!(await claimDrop(drop, message.author.id))) return;

  try {
    await completeDrop(
      drop,
      message.client as NypsiClient,
      message.author.id,
      message.author.username,
    );
    await getRest(message.client as NypsiClient)
      .put(
        Routes.channelMessageOwnReaction(message.channelId, message.id, encodeURIComponent("🏆")),
      )
      .catch((error) =>
        logger.error("lootdrop: failed to react to winning message", {
          channelId: message.channelId,
          dropId: drop.id,
          error,
          messageId: message.id,
        }),
      );
  } catch (error) {
    logger.error("lootdrop: failed to complete typed drop", {
      channelId: drop.channelId,
      dropId: drop.id,
      error,
      winnerId: message.author.id,
    });
    await updateDropMessage(
      drop,
      "something went wrong with this lootdrop, please make a support ticket",
    );
    await removeActiveDrop(drop);
  }
}
