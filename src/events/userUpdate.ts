import { User } from "discord.js";
import { NypsiClient } from "../models/Client";
import { clearMemberCache } from "../utils/functions/member";
import { addNewUsername, fetchUsernameHistory, isTracking } from "../utils/functions/users/history";
import { updateLastKnownUsername } from "../utils/functions/users/tag";
import { hasProfile } from "../utils/functions/users/utils";

export default async function userUpdate(oldUser: User, newUser: User) {
  oldUser.client.guilds.cache
    .filter((g) => g.members.cache.has(oldUser.id))
    .forEach((g) => clearMemberCache(g.id));

  if (oldUser.username != newUser.username) {
    if (await hasProfile(newUser.id)) {
      if (!(await determineCluster(newUser.client as NypsiClient, newUser.id))) return;

      await updateLastKnownUsername(newUser.id, newUser.username);

      if (!(await isTracking(newUser.id))) return;
      const usernames = await fetchUsernameHistory(newUser.id, 1);
      if (!usernames.find((i) => i.value === oldUser.username)) {
        await addNewUsername(newUser.id, oldUser.username);
      }
      await addNewUsername(newUser.id, newUser.username);
    }
  }
}

// PREVENTS DOUBLE UPLOADS
async function determineCluster(client: NypsiClient, userId: string) {
  const thisId = client.cluster.id;

  const res = await client.cluster.broadcastEval(
    async (c, { currentId, userId }) => {
      const client = c as unknown as NypsiClient;

      if (client.cluster.id == currentId) return "current";

      const user = await client.users.fetch(userId).catch(() => {});

      if (!user) return;

      return client.cluster.id;
    },
    { context: { currentId: thisId, userId: userId } },
  );

  let lowest = client.cluster.id;

  for (const response of res) {
    if (typeof response === "number") {
      if (response < thisId) {
        lowest = response;
      }
    }
  }

  if (lowest == client.cluster.id) return true;
  return false;
}
