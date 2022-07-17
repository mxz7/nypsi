import { WholesomeImage, WholesomeSuggestion } from "@prisma/client";
import { GuildMember, Webhook } from "discord.js";
import ImgurClient from "imgur";
import fetch from "node-fetch";
import prisma from "../database/database";
import { logger } from "../logger";

const imgur = new ImgurClient({
    // accessToken: process.env.IMGUR_ACCESSTOKEN,
    clientId: process.env.IMGUR_CLIENTID,
    clientSecret: process.env.IMGUR_CLIENTSECRET,
    refreshToken: process.env.IMGUR_REFRESHTOKEN,
});

declare function require(name: string);

let uploadDisabled = false;

let uploadCount = 0;
setInterval(() => {
    uploadCount = 0;
    logger.info("imgur upload count reset");
}, 86400000);

let wholesomeWebhook: Webhook;

let wholesomeCache: WholesomeImage[];

export function isImageUrl(url: string): boolean {
    return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(url);
}

export async function redditImage(post: any, allowed: any): Promise<string> {
    let image = post.data.url;

    if (image.includes("imgur.com/a/")) {
        post = allowed[Math.floor(Math.random() * allowed.length)];
        image = post.data.url;
    }

    if (image.includes("imgur") && !image.includes("gif")) {
        image = "https://i.imgur.com/" + image.split("/")[3];
        if (!isImageUrl(image)) {
            image = "https://i.imgur.com/" + image.split("/")[3] + ".gif";
        }
        return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author;
    }

    if (image.includes("gfycat")) {
        const link = await fetch("https://api.gfycat.com/v1/gfycats/" + image.split("/")[3]).then((url) => url.json());

        if (link.gfyItem) {
            image = link.gfyItem.max5mbGif;
            return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author;
        }
    }

    let count = 0;

    while (!isImageUrl(image)) {
        if (count >= 10) {
            logger.warn("couldnt find image @ " + post.data.subreddit_name_prefixed);
            return "lol";
        }

        count++;

        post = allowed[Math.floor(Math.random() * allowed.length)];
        image = post.data.url;

        if (image.includes("imgur.com/a/")) {
            post = allowed[Math.floor(Math.random() * allowed.length)];
            image = post.data.url;
        }

        if (image.includes("imgur") && !image.includes("gif") && !image.includes("png")) {
            image = "https://i.imgur.com/" + image.split("/")[3];
            image = "https://i.imgur.com/" + image.split("/")[3] + ".png";
            if (!isImageUrl(image)) {
                image = "https://i.imgur.com/" + image.split("/")[3] + ".gif";
                return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author;
            }
        }

        if (image.includes("gfycat")) {
            const link = await fetch("https://api.gfycat.com/v1/gfycats/" + image.split("/")[3]).then((url) => url.json());

            if (link) {
                image = link.gfyItem.max5mbGif;
                return image + "|" + post.data.title + "|" + post.data.permalink + "|" + post.data.author;
            }
        }
    }

    let title = post.data.title;

    if (title.length >= 150) {
        const a = title.split("");
        let newTitle = "";
        let count = 0;

        for (const char of a) {
            if (count == 145) {
                newTitle = newTitle + "...";
                break;
            } else {
                count++;
                newTitle = newTitle + char;
            }
        }

        title = newTitle;
    }

    return image + "|" + title + "|" + post.data.permalink + "|" + post.data.author;
}

/**
 * @returns {Boolean}
 * @param {GuildMember} submitter
 * @param {String} image
 */
export async function suggestWholesomeImage(submitter: GuildMember, image: string): Promise<boolean> {
    if (!wholesomeWebhook) {
        const { getGuild } = require("../../nypsi");
        const guild = await getGuild("747056029795221513");

        const webhooks = await guild.fetchWebhooks();

        wholesomeWebhook = await webhooks.find((w) => w.id == "846092969396142080");
        logger.info(`wholesome webhook assigned as ${wholesomeWebhook.id}`);
    }

    const query1 = await prisma.wholesomeImage.findUnique({
        where: {
            image: image,
        },
        select: {
            id: true,
        },
    });

    if (query1) {
        return false;
    }

    const query2 = await prisma.wholesomeSuggestion.findUnique({
        where: {
            image: image,
        },
        select: {
            id: true,
        },
    });

    if (query2) {
        return false;
    }

    const { id } = await prisma.wholesomeSuggestion.create({
        data: {
            image: image,
            submitter: submitter.user.tag,
            submitterId: submitter.user.id,
            uploadDate: new Date(),
        },
    });

    const { CustomEmbed } = require("../models/EmbedBuilders");

    const embed = new CustomEmbed().setColor("#111111").setTitle("wholesome suggestion #" + id);

    embed.setDescription(`**submitter** ${submitter.user.tag} (${submitter.user.id})\n**url** ${image}`);

    embed.setFooter(`$wholesome accept ${id} | $wholesome deny ${id}`);

    embed.setImage(image);

    await wholesomeWebhook.send({ embeds: [embed] });

    return true;
}

/**
 * @returns {Boolean}
 * @param {Number} id
 * @param {GuildMember} accepter
 */
export async function acceptWholesomeImage(id: number, accepter: GuildMember): Promise<boolean> {
    const query = await prisma.wholesomeSuggestion.findUnique({
        where: {
            id: id,
        },
    });

    if (!query) return false;

    await prisma.wholesomeImage.create({
        data: {
            image: query.image,
            submitter: query.submitter,
            submitterId: query.submitterId,
            uploadDate: query.uploadDate,
            accepterId: accepter.user.id,
        },
    });

    await prisma.wholesomeSuggestion.delete({
        where: {
            id: id,
        },
    });

    clearWholesomeCache();

    const { requestDM } = require("../../nypsi");
    const { getDMsEnabled } = require("../economy/utils");

    if (await getDMsEnabled(query.submitterId)) {
        requestDM(query.submitterId, `your wholesome image (${query.image}) has been accepted`, true);
    }

    return true;
}

/**
 * @returns {Boolean}
 * @param {Number} id
 */
export async function denyWholesomeImage(id: number) {
    const d = await prisma.wholesomeSuggestion.delete({
        where: {
            id: id,
        },
    });

    if (!d) {
        return false;
    }

    return true;
}

/**
 * @returns {{ id: Number, image: String, submitter: String, submitter_id: String, accepter: String, date: Date }}
 * @param {id} Number
 */
export async function getWholesomeImage(id?: number): Promise<WholesomeImage> {
    if (id) {
        const query = await prisma.wholesomeImage.findUnique({
            where: {
                id: id,
            },
        });
        return query;
    } else {
        if (wholesomeCache) {
            return wholesomeCache[Math.floor(Math.random() * wholesomeCache.length)];
        } else {
            const query = await prisma.wholesomeImage.findMany();

            wholesomeCache = query;

            return wholesomeCache[Math.floor(Math.random() * wholesomeCache.length)];
        }
    }
}

export function clearWholesomeCache() {
    wholesomeCache = undefined;
}

/**
 * @returns {Boolean}
 * @param {Number} id
 */
export async function deleteFromWholesome(id: number) {
    const query = await prisma.wholesomeImage.delete({
        where: {
            id: id,
        },
    });

    clearWholesomeCache();

    if (query) {
        return true;
    } else {
        return false;
    }
}

/**
 * @returns {{Array<{ id: Number, image: String, submitter: String, submitter_id: String, date: Date }>}}
 */
export async function getAllSuggestions(): Promise<WholesomeSuggestion[]> {
    const query = await prisma.wholesomeSuggestion.findMany();

    return query;
}

/**
 * @returns {String}
 * @param {String} url
 */
export async function uploadImageToImgur(url: string): Promise<string> {
    let fallback = false;

    if (uploadCount >= 775) fallback = true;
    if (uploadDisabled) fallback = true;
    let fail = false;

    logger.info(`uploading ${url}`);
    const boobies = await imgur
        .upload({
            image: url,
        })
        .catch((e) => {
            logger.error("error occured uploading image to imgur");
            logger.error(e);
            fail = true;
        });

    if (fail) {
        uploadDisabled = true;

        setTimeout(() => {
            uploadDisabled = false;
        }, 1800000);

        fallback = true;
    }

    if (fallback || !boobies) {
        logger.info("using fallback uploader..");

        const res = await fallbackUpload(url);

        if (!res) {
            logger.error("fallback upload failed");
            return null;
        }

        return res;
    }

    logger.info(`uploaded (${boobies.data.link})`);
    return boobies.data.link;
}

async function fallbackUpload(url: string) {
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_TOKEN}&image=${url}`).then((res) =>
        res.json()
    );

    if (!res.success) {
        return false;
    }

    return res.display_url;
}
