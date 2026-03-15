import { Hono } from "hono";
import { calcItemValue } from "../../utils/functions/economy/inventory";
import { getObtainingData, ObtainingData } from "../../utils/functions/economy/item_info";
import { getItems } from "../../utils/functions/economy/utils";

const itemController = new Hono();

itemController.get("/:itemId/obtaining", async (c) => {
  const itemId = c.req.param("itemId");
  const items = getItems();
  const selected = items[itemId];

  if (!selected) {
    c.status(404);
    return c.json({ error: "item not found" });
  }

  const data = getObtainingData(selected);
  return c.json(data as ObtainingData);
});

itemController.get("/:itemId/value", async (c) => {
  const itemId = c.req.param("itemId");
  const value = await calcItemValue(itemId);
  return c.json({ value });
});

export default itemController;
