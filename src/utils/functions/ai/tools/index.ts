import { FunctionTool } from "openai/resources/responses/responses";
import { logger } from "../../../logger";
import { commandTools, executeCommandTool } from "./commands";
import { executeItemTool, itemTools } from "./items";

export const aiTools: FunctionTool[] = [...commandTools, ...itemTools];

export async function executeAiTool(name: string, rawArguments: string): Promise<string> {
  let args: Record<string, unknown> = {};

  try {
    args = rawArguments ? JSON.parse(rawArguments) : {};
  } catch {
    args = {};
  }

  try {
    const result = (await executeCommandTool(name, args)) ?? (await executeItemTool(name, args));

    if (result === null) return JSON.stringify({ error: "unknown tool" });

    return result;
  } catch (e) {
    logger.error("ai tools: tool execution failed", { e, name, args });
    return JSON.stringify({ error: "failed to execute tool" });
  }
}
