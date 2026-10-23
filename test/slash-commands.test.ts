import type { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import { describe, expect, test, vi } from "vitest";
import { deleteSlashCommands } from "../src/utils/functions/slash-commands";

const applicationId = "123456789012345678";
const guildId = "234567890123456789";

describe("explicit slash command deletion", () => {
  test.each([undefined, guildId])("clears only the requested scope: %s", async (targetGuild) => {
    const rest = { put: vi.fn<REST["put"]>().mockResolvedValue([]) };

    await deleteSlashCommands(rest, applicationId, targetGuild);

    expect(rest.put).toHaveBeenCalledExactlyOnceWith(
      targetGuild
        ? Routes.applicationGuildCommands(applicationId, targetGuild)
        : Routes.applicationCommands(applicationId),
      { body: [] },
    );
  });

  test("propagates deletion failures", async () => {
    const rest = {
      put: vi.fn<REST["put"]>().mockRejectedValue(new Error("cannot delete commands")),
    };

    await expect(deleteSlashCommands(rest, applicationId)).rejects.toThrow(
      "cannot delete commands",
    );
  });
});
