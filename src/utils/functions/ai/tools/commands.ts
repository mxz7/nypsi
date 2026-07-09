import { FunctionTool } from "openai/resources/responses/responses";
import {
  commandAliasExists,
  getCommandData,
  getCommandFromAlias,
  getCommandKeys,
} from "../../../handlers/commandhandler";

export const commandTools: FunctionTool[] = [
  {
    type: "function",
    name: "list_commands",
    description:
      "List every nypsi command with its name, description, category, permissions and aliases.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "get_command_info",
    description:
      "Get the full raw data for a specific nypsi command (by name or alias), including permissions, aliases and docs link.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "the command name or alias to look up" },
      },
      required: ["command"],
      additionalProperties: false,
    },
    strict: true,
  },
];

export async function executeCommandTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string | null> {
  switch (name) {
    case "list_commands": {
      const rows = Array.from(getCommandKeys())
        .sort((a, b) => a.localeCompare(b))
        .map((commandName) => getCommandData(commandName))
        .filter(Boolean)
        .map((command) => ({
          name: command.name,
          description: command.description,
          category: command.category,
          permissions: command.permissions || [],
          aliases: command.aliases || [],
          docs: command.docs || null,
        }));

      return JSON.stringify(rows);
    }
    case "get_command_info": {
      const query = String(args.command || "")
        .toLowerCase()
        .trim();

      const command = commandAliasExists(query)
        ? getCommandData(getCommandFromAlias(query))
        : getCommandData(query);

      if (!command) return JSON.stringify({ error: "command not found" });

      return JSON.stringify(command, (key, value) =>
        typeof value === "function" ? undefined : value,
      );
    }
    default:
      return null;
  }
}
