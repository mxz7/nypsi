import { Hono } from "hono";
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

export default itemController;
