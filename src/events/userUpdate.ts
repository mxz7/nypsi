import { User } from "discord.js";
import { getPrestige, userExists } from "../utils/economy/utils";
import { uploadImageToImgur } from "../utils/functions/image";
import { isPremium } from "../utils/premium/utils";
import { addNewAvatar, addNewUsername, hasProfile, isTracking, updateLastKnowntag } from "../utils/users/utils";

const queue: User[] = [];
let interval;

export default async function userUpdate(oldUser: User, newUser: User) {
    if (oldUser.tag != newUser.tag) {
        if (await hasProfile(newUser.id)) {
            await updateLastKnowntag(newUser.id, newUser.tag);
            if (!(await isTracking(newUser.id))) return;
            await addNewUsername(newUser.id, newUser.tag);
        }
    }

    if (oldUser.displayAvatarURL({ dynamic: true, size: 256 }) != newUser.displayAvatarURL({ dynamic: true, size: 256 })) {
        if (!(await userExists(newUser.id))) return;
        if (!(await isPremium(newUser.id)) && (await getPrestige(newUser.id)) < 2) return;

        if (!(await isTracking(newUser.id))) return;

        queue.push(newUser);

        if (!interval) {
            interval = setInterval(doQueue, 10000);
        }
    }
}

async function doQueue() {
    const user = queue.shift();

    if (!user) return;

    const url = await uploadImageToImgur(user.displayAvatarURL({ format: "png", dynamic: true, size: 256 }));

    if (!url) return;

    await addNewAvatar(user.id, url);

    if (queue.length == 0) {
        clearInterval(interval);
        interval = undefined;
    }
}
