import { Message } from "discord.js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { resetRedisMock } from "../mocks/redis";

const { redisMock } = await vi.hoisted(async () => {
  const { createRedisMock } = await import("../mocks/redis");

  return {
    redisMock: createRedisMock(),
  };
});

vi.mock("../../src/init/redis", () => ({ default: redisMock }));

import { isChatSpamExempt } from "../../src/utils/functions/nypsi/chat-spam-exemptions";

function createMessage(content: string, createdTimestamp: number) {
  return {
    author: { id: "user" },
    channelId: "channel",
    content,
    createdTimestamp,
  } as Message;
}

afterEach(() => {
  resetRedisMock(redisMock);
  vi.clearAllMocks();
});

describe("nypsi chat spam exemptions", () => {
  test("exempts cat when a newer cat bot message replaced the previous timestamp", async () => {
    redisMock.get.mockResolvedValue("101500");

    await expect(isChatSpamExempt(createMessage("Cat", 100000))).resolves.toBe(true);
  });

  test("does not exempt cat outside the cat bot activity window", async () => {
    redisMock.get.mockResolvedValue("131000");

    await expect(isChatSpamExempt(createMessage("cat", 100000))).resolves.toBe(false);
  });
});
