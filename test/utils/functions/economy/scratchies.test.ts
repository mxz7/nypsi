import { ButtonStyle, type ButtonInteraction, type GuildMember } from "discord.js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Item } from "../../../../src/types/Economy";

const mocks = vi.hoisted(() => ({ reward: vi.fn() }));
vi.mock("../../../../src/models/EmbedBuilders", async () => {
  const { EmbedBuilder } = await import("discord.js");
  return {
    CustomEmbed: class extends EmbedBuilder {
      setHeader() {
        return this;
      }
    },
  };
});
vi.mock("../../../../src/utils/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../../../src/utils/functions/playing", () => ({ removeUserPlaying: vi.fn() }));
vi.mock("../../../../src/utils/functions/economy/achievements", () => ({ addProgress: vi.fn() }));
vi.mock("../../../../src/utils/functions/economy/tasks", () => ({ addTaskProgress: vi.fn() }));
vi.mock("../../../../src/utils/functions/economy/events", () => ({ addEventProgress: vi.fn() }));
vi.mock("../../../../src/utils/functions/economy/gems", () => ({}));
vi.mock("../../../../src/utils/functions/economy/inventory", () => ({ isGem: () => false }));
vi.mock("../../../../src/utils/functions/economy/loot_pools", () => ({
  giveLootPoolResult: mocks.reward,
  describeLootPoolResult: () => "a super cursor",
}));
vi.mock("../../../../src/utils/functions/economy/stats", () => ({ addStat: vi.fn() }));
vi.mock("../../../../src/utils/functions/economy/utils", () => ({
  getItems: () => ({ super_cursor: { emoji: "👆" } }),
}));

import ScratchCard from "../../../../src/utils/functions/economy/scratchies";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

async function createCard() {
  const member = {
    user: { id: "123456789012345678", username: "player", avatarURL: () => null },
  } as GuildMember;
  return new ScratchCard(member, {
    id: "lucky_scratch_card",
    name: "lucky scratch card",
    clicks: 6,
  } as Item).setArea(
    Array.from({ length: 5 }, (_, y) =>
      Array.from({ length: 3 }, (_, x) => ({
        clicks: 0,
        result: x === 1 && y >= 2 ? { item: "super_cursor", count: 1 } : {},
      })),
    ),
  );
}

function click(card: ScratchCard, y: number, x: number) {
  return card.clicked({ customId: `btn-reveal-scratchie:${y}:${x}` } as ButtonInteraction);
}

test("repeating a winning square preserves the line, remaining clicks, and single reward", async () => {
  const card = await createCard();
  await click(card, 3, 1);
  await click(card, 3, 2);
  await click(card, 4, 1);
  await click(card, 2, 1);

  expect(card.won).toBe(true);
  expect(card.remainingClicks).toBe(2);
  expect(mocks.reward).toHaveBeenCalledExactlyOnceWith(
    "123456789012345678",
    { item: "super_cursor", count: 1 },
    "item:lucky_scratch_card",
  );

  for (const y of [2, 3, 4]) await click(card, y, 1);

  expect(card.remainingClicks).toBe(2);
  expect(card.area.slice(2).map((row) => row[1].clicks)).toEqual([2, 2, 2]);
  for (const row of card.getButtons(true).slice(2)) {
    expect(row.components[1].toJSON()).toMatchObject({ style: ButtonStyle.Success });
  }
  expect(mocks.reward).toHaveBeenCalledTimes(1);

  await click(card, 2, 0);
  expect(card.remainingClicks).toBe(1);
});

test("repeating a revealed square does not spend another click", async () => {
  const card = await createCard();
  await click(card, 3, 2);
  await click(card, 3, 2);
  expect(card.remainingClicks).toBe(5);
  expect(card.area[3][2].clicks).toBe(1);
  expect(mocks.reward).not.toHaveBeenCalled();
});
