import { Entitlement } from "discord.js";
import { renewUser } from "../utils/functions/premium/premium";
import { logger } from "../utils/logger";

export default async function entitlementUpdate(entitlement: Entitlement) {
  logger.info("received entitlement update", entitlement.toJSON());

  await renewUser(entitlement.userId);
}
