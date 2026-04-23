import { SnipedMessage } from "../../../types/Snipe";
import { logger } from "../../logger";

export const snipe: Map<string, SnipedMessage> = new Map();
export const eSnipe: Map<string, SnipedMessage> = new Map();

export function runSnipeClearIntervals() {
  setInterval(() => {
    const now = new Date().getTime();

    let snipeCount = 0;
    let eSnipeCount = 0;

    snipe.forEach((msg) => {
      const diff = now - msg.createdTimestamp;

      if (diff >= 43200000) {
        snipe.delete(msg.channel.id);
        snipeCount++;
      }
    });

    if (snipeCount > 0) {
      logger.info("::auto deleted " + snipeCount.toLocaleString() + " sniped messages");
    }

    eSnipe.forEach((msg) => {
      const diff = now - msg.createdTimestamp;

      if (diff >= 43200000) {
        eSnipe.delete(msg.channel.id);
        eSnipeCount++;
      }
    });

    if (eSnipeCount > 0) {
      logger.info("::auto deleted " + eSnipeCount.toLocaleString() + " edit sniped messages");
    }
  }, 3600000);
}
