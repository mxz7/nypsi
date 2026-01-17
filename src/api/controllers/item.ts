import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { getObtainingData, ObtainingData } from "../../utils/functions/economy/item_info";
import { getItems } from "../../utils/functions/economy/utils";

const itemController = new Hono();

itemController.get(
  "/items/:itemId/obtaining",
  bearerAuth({ token: process.env.API_AUTH }),
  async (c) => {
    const itemId = c.req.param("itemId");
    const items = getItems();
    const selected = items[itemId];

    if (!selected) {
      c.status(404);
      return c.json({ error: "item not found" });
    }

    const data = getObtainingData(selected);
    return c.json({ sources: data.sources, pools: data.poolsDetailed ?? [] } as {
      sources: string[];
      pools: ObtainingData["poolsDetailed"];
    });
  },
);

export default itemController;
