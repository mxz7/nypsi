import { Hono } from "hono";
import { checkStatus } from "../..";

const router = new Hono();
export default router;

router.get("/status", async (c) => {
  const status = await checkStatus();

  return c.json(status);
});
