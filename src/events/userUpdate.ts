import { User } from "discord.js";
import { NypsiClient } from "../models/Client";
import { getRawLevel } from "../utils/functions/economy/levelling";
import { userExists } from "../utils/functions/economy/utils";
import { uploadImage } from "../utils/functions/image";
import { clearMemberCache } from "../utils/functions/member";
import { addNewAvatar, addNewUsername, isTracking } from "../utils/functions/users/history";
import { updateLastKnownUsername } from "../utils/functions/users/tag";
import { hasProfile } from "../utils/functions/users/utils";

const queue: User[] = [];
let interval: NodeJS.Timeout;

export default async function userUpdate(oldUser: User, newUser: User) {
  oldUser.client.guilds.cache
    .filter((g) => g.members.cache.has(oldUser.id))
    .forEach((g) => clearMemberCache(g.id));

  if (oldUser.username != newUser.username) {
    if (await hasProfile(newUser.id)) {
      if (!(await determineCluster(newUser.client as NypsiClient, newUser.id))) return;

      await updateLastKnownUsername(newUser.id, newUser.username);

      if (!(await isTracking(newUser.id))) return;
      await addNewUsername(newUser.id, newUser.username);
    }
  }

  if (oldUser.displayAvatarURL({ size: 256 }) != newUser.displayAvatarURL({ size: 256 })) {
    if (!(await userExists(newUser.id))) return;
    if ((await getRawLevel(newUser.id)) < 50) return;

    if (!(await isTracking(newUser.id))) return;

    queue.push(newUser);

    if (!interval) {
      interval = setInterval(doQueue.bind(null, newUser.client), 1000);
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

async function doQueue(client: NypsiClient) {
  const user = queue.shift();

  if (!user) return;

  if (!(await determineCluster(client, user.id))) return;

  let uploadUrl = user.displayAvatarURL({ size: 256 });

  if (uploadUrl.endsWith("webp")) {
    uploadUrl = user.displayAvatarURL({ extension: "gif", size: 256 });
  } else {
    uploadUrl = user.displayAvatarURL({ extension: "png", size: 256 });
  }

  const url = await uploadImage(
    user.client as NypsiClient,
    uploadUrl,
    "avatar",
    `user: ${user.id} (${user.username})`,
  );

  if (!url) return;

  await addNewAvatar(user.id, url);

  if (queue.length == 0) {
    clearInterval(interval);
    interval = undefined;
  }
}
