import { FunctionTool } from "openai/resources/responses/responses";
import { getAchievements } from "../../economy/utils";

export const achievementTools: FunctionTool[] = [
  {
    type: "function",
    name: "list_achievements",
    description:
      "List every nypsi achievement with its name, description, target and prize(s). Prize item ids can be looked up with get_item_info.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
];

export async function executeAchievementTool(
  name: string,
  _args: Record<string, unknown>,
): Promise<string | null> {
  switch (name) {
    case "list_achievements": {
      return JSON.stringify(Object.values(getAchievements()));
    }
    default:
      return null;
  }
}
