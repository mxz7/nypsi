import { User } from "discord.js";
import { getPrestige, userExists } from "../utils/economy/utils";
import { uploadImageToImgur } from "../utils/functions/image";
import { NypsiClient } from "../utils/models/Client";
import { isPremium } from "../utils/premium/utils";
import { addNewAvatar, addNewUsername, hasProfile, isTracking, updateLastKnowntag } from "../utils/users/utils";

const queue: User[] = [];
let interval: NodeJS.Timer;

export default async function userUpdate(oldUser: User, newUser: User) {
    if (oldUser.tag != newUser.tag) {
        if (await hasProfile(newUser.id)) {
            if (!(await determineCluster(newUser.client as NypsiClient, newUser.id))) return;

            await updateLastKnowntag(newUser.id, newUser.tag);

            if (!(await isTracking(newUser.id))) return;
            await addNewUsername(newUser.id, newUser.tag);
        }
    }

    if (oldUser.displayAvatarURL({ size: 256 }) != newUser.displayAvatarURL({ size: 256 })) {
        if (!(await userExists(newUser.id))) return;
        if (!(await isPremium(newUser.id)) && (await getPrestige(newUser.id)) < 1) return;

        if (!(await isTracking(newUser.id))) return;

        queue.push(newUser);

        if (!interval) {
            interval = setInterval(doQueue.bind(null, newUser.client), 5000);
        }
    }
}

async function determineCluster(client: NypsiClient, userId: string) {
    const thisId = client.cluster.id;

    const res = await client.cluster.broadcastEval(
        async (c, { currentId, userId }) => {
            const client = c as NypsiClient;

            if (client.cluster.id == currentId) return "current";

            const user = await client.users.fetch(userId).catch(() => {});

            if (!user) return;

            return client.cluster.id;
        },
        { context: { currentId: thisId, userId: userId } }
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

    const url = await uploadImageToImgur(uploadUrl);

    if (!url) return;

    await addNewAvatar(user.id, url);

    if (queue.length == 0) {
        clearInterval(interval);
        interval = undefined;
    }
}
