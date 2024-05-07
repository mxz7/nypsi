import { Entitlement } from "discord.js";
import { NypsiClient } from "../models/Client";
import { addMember, getTier, renewUser, setTier } from "../utils/functions/premium/premium";
import { createProfile, hasProfile } from "../utils/functions/users/utils";
import { logger } from "../utils/logger";

export default async function entitlementCreate(entitlement: Entitlement) {
  logger.info("received entitlement create", entitlement.toJSON());

  if (!(await hasProfile(entitlement.userId))) await createProfile(entitlement.userId);

  const tier = await getTier(entitlement.userId);

  if (tier < 4) {
    await setTier(entitlement.userId, 4);
    await renewUser(entitlement.userId, entitlement.client as NypsiClient);
  } else {
    await addMember(entitlement.userId, 4);
  }
}
