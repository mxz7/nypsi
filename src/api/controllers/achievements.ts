import { Hono } from "hono";
import { setProgress } from "../../utils/functions/economy/achievements";

const router = new Hono();
export default router;

router.post("/animal_lover/progress/:userid", async (c) => {
  let body: { progress: number };

  try {
    body = await c.req.json();
  } catch {
    c.status(400);
    return c.json({ error: "invalid body" });
  }

  if (!body.progress) {
    c.status(400);
    return c.json({ error: "invalid body" });
  }

  const userId = c.req.param("userid");
  await setProgress(userId, "animal_lover", body.progress);
  return c.body(null, 200);
});
