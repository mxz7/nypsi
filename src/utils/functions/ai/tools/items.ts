import { FunctionTool } from "openai/resources/responses/responses";
import { calcItemValue, selectItem } from "../../economy/inventory";
import { getItems } from "../../economy/utils";

export const itemTools: FunctionTool[] = [
  {
    type: "function",
    name: "search_items",
    description:
      "Search nypsi economy items by name or alias. Returns matching item ids/names to use with get_item_info.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "search query, e.g. item name or alias" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_item_info",
    description:
      "Get the full raw data for a specific nypsi economy item (by id, name or alias), including its current worth/value.",
    parameters: {
      type: "object",
      properties: {
        item: { type: "string", description: "the item id, name or alias to look up" },
      },
      required: ["item"],
      additionalProperties: false,
    },
    strict: true,
  },
];

export async function executeItemTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string | null> {
  switch (name) {
    case "search_items": {
      const query = String(args.query || "")
        .toLowerCase()
        .trim();

      const matches = Object.values(getItems())
        .filter((item) => !item.hidden)
        .filter(
          (item) =>
            item.id.includes(query) ||
            item.name?.toLowerCase().includes(query) ||
            (item.aliases || []).some((alias) => alias.toLowerCase().includes(query)),
        )
        .slice(0, 25)
        .map((item) => ({ id: item.id, name: item.name, category: item.role }));

      return JSON.stringify(matches);
    }
    case "get_item_info": {
      const query = String(args.item || "")
        .toLowerCase()
        .trim();

      const item = selectItem(query);

      if (!item) return JSON.stringify({ error: "item not found" });

      const worth = await calcItemValue(item.id);

      return JSON.stringify({ worth: worth || null, item });
    }
    default:
      return null;
  }
}
