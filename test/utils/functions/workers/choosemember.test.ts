import { describe, expect, test } from "vitest";
import chooseMember from "../../../../src/utils/functions/workers/choosemember";

describe("chooseMember", () => {
  const members = [
    {
      userId: "100",
      username: "alice",
      displayName: "Alice Example",
      nickname: "ally",
      roles: [],
      bot: false,
      joinedTimestamp: 1,
    },
    {
      userId: "200",
      username: "bob",
      displayName: "Bob Example",
      roles: [],
      bot: false,
      joinedTimestamp: 2,
    },
  ];

  test("matches exact user IDs and usernames", async () => {
    await expect(chooseMember(members, "200")).resolves.toBe("200");
    await expect(chooseMember(members, "alice")).resolves.toBe("100");
  });

  test("selects the strongest fuzzy match", async () => {
    await expect(chooseMember(members, "alicee")).resolves.toBe("100");
  });

  test("returns null when no candidate reaches the score threshold", async () => {
    await expect(chooseMember(members, "zzzzzz")).resolves.toBeNull();
  });
});
