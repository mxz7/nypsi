import * as express from "express";
import { checkStatus } from "../..";
import redis from "../../init/redis";
import { setProgress } from "../functions/economy/achievements";
import { calcItemValue } from "../functions/economy/inventory";
import { loadItems } from "../functions/economy/utils";
import { getTax, getTaxRefreshTime } from "../functions/tax";
import { logger } from "../logger";

loadItems(false);

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

export function listen() {
  // app.post(
  //   "/topgg",
  //   webhook.listener((vote) => {
  //     logger.info(`received vote: ${vote.user}`);
  //     doVote(vote);
  //   }),
  // );

  // app.post("/kofi", async (req, response) => {
  //   const data = JSON.parse(req.body.data) as KofiResponse;

  //   logger.info("received kofi data", data);

  //   if (data.verification_token != process.env.KOFI_VERIFICATION) {
  //     logger.error("received faulty kofi data", data);
  //     return;
  //   }

  //   response.status(200).send();

  //   return handleKofiData(data);
  // });

  app.get("/status", async (req, res) => {
    res.set("cache-control", "max-age=60");

    const response = await checkStatus();

    res.json(response);
  });

  app.get("/tax", async (req, res) => {
    res.set("cache-control", "max-age=60");

    const [tax, refreshTime] = await Promise.all([getTax(), getTaxRefreshTime()]);

    res.json({
      tax,
      refreshTime,
    });
  });

  app.post("/achievement/animal_lover/progress/:id", async (req, res) => {
    const auth = req.headers.authorization;

    if (auth !== process.env.API_AUTH) {
      res.status(401).send();
      return;
    }

    const { id } = req.params;
    const { progress } = req.body;
    await setProgress(id, "animal_lover", progress);
    res.status(200).send();
  });

  app.delete("/redis", express.text(), async (req, res) => {
    const auth = req.headers.authorization;

    if (auth !== process.env.API_AUTH) {
      res.status(401).send();
      return;
    }

    logger.info(`deleting redis keys (${req.body.split("\n").join(", ")})`);

    await redis.del(...req.body.split("\n"));

    res.status(200).send();
  });

  app.get("/item/value/:item", async (req, res) => {
    const { item } = req.params;

    const value = await calcItemValue(item);
    res.status(200).json({
      value,
    });
  });

  app.listen(process.env.EXPRESS_PORT || 5000);

  logger.info(`listening on port ${process.env.EXPRESS_PORT || 5000}`);
}
