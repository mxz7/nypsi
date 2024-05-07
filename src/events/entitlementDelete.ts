import { Entitlement } from "discord.js";
import { NypsiClient } from "../models/Client";
import { setExpireDate } from "../utils/functions/premium/premium";
import { logger } from "../utils/logger";

export default async function entitlementDelete(entitlement: Entitlement) {
  logger.info("received entitlement delete", entitlement.toJSON());

  await setExpireDate(entitlement.userId, entitlement.endsAt, entitlement.client as NypsiClient);
}
