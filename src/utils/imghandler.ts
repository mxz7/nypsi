import { logger } from "./logger"
import fetch from "node-fetch"

const images: Map<string, Map<string, any>> = new Map()

const bdsmLinks = [
    "https://www.reddit.com/r/bdsm.json?limit=777",
    "https://www.reddit.com/r/bondage.json?limit=777",
    "https://www.reddit.com/r/dominated.json?limit=777",
    "https://www.reddit.com/r/femdom.json?limit=777",
]
const thighsLinks = ["https://www.reddit.com/r/legs.json?limit=777", "https://www.reddit.com/r/thickthighs.json?limit=777"]
const boobLinks = [
    "https://www.reddit.com/r/Boobies.json?limit=777",
    "https://www.reddit.com/r/tits.json?limit=777",
    "https://www.reddit.com/r/TinyTits.json?limit=777",
]
const assLinks = [
    "https://www.reddit.com/r/ass.json?limit=777",
    "https://www.reddit.com/r/facedownassup.json?limit=777",
    "https://www.reddit.com/r/assinthong.json?limit=777",
    "https://www.reddit.com/r/buttplug.json?limit=777",
    "https://www.reddit.com/r/TheUnderbun.json?limit=777",
    "https://www.reddit.com/r/booty.json?limit=777",
    "https://www.reddit.com/r/WomenBendingOver.json?limit=777",
    "https://www.reddit.com/r/thickwhitegirls.json?limit=777",
]
const pornLinks = [
    "https://www.reddit.com/r/collegesluts.json?limit=777",
    "https://www.reddit.com/r/realgirls.json?limit=777",
    "https://www.reddit.com/r/legalteens.json?limit=777",
    "https://www.reddit.com/r/amateur.json?limit=777",
    "https://www.reddit.com/r/gonewild.json?limit=777",
    "https://www.reddit.com/r/gonewild18.json?limit=777",
    "https://www.reddit.com/r/collegeamateurs.json?limit=777",
    "https://www.reddit.com/r/irlgirls.json?limit=777",
    "https://www.reddit.com/r/camwhores.json?limit=777",
    "https://www.reddit.com/r/camsluts.json?limit=777",
    "https://www.reddit.com/r/cumsluts.json?limit=777",
    "https://www.reddit.com/r/cumfetish.json?limit=777",
    "https://www.reddit.com/r/creampies.json?limit=777",
]
const feetLinks = [
    "https://www.reddit.com/r/feet.json?limit=777",
    "https://www.reddit.com/r/feetpics.json?limit=777",
    "https://www.reddit.com/r/Feet_NSFW.json?limit=777",
]
const birbLinks = [
    "https://www.reddit.com/r/birb.json?limit=777",
    "https://www.reddit.com/r/budgies.json?limit=777",
    "https://www.reddit.com/r/parrots.json?limit=777",
]
const catLinks = [
    "https://www.reddit.com/r/cat.json?limit=777",
    "https://www.reddit.com/r/catsyawning.json?limit=777",
    "https://www.reddit.com/r/Kitten.json?limit=777",
    "https://www.reddit.com/r/kitty.json?limit=777",
    "https://www.reddit.com/r/catpics.json?limit=777",
    "https://www.reddit.com/r/CatsInSinks.json?limit=777",
    "https://www.reddit.com/r/CatsInBusinessAttire.json?limit=777",
    "https://www.reddit.com/r/MildlyStartledCats.json?limit=777",
    "https://www.reddit.com/r/tuckedinkitties.json?limit=777",
    "https://www.reddit.com/r/Blep.json?limit=777",
    "https://www.reddit.com/r/Floof.json?limit=777",
    "https://www.reddit.com/r/Catloaf.json?limit=777",
]
const dogLinks = [
    "https://www.reddit.com/r/dog.json?limit=777",
    "https://www.reddit.com/r/corgi.json?limit=777",
    "https://www.reddit.com/r/dogpictures.json?limit=777",
    "https://www.reddit.com/r/goldenretrievers.json?limit=777",
    "https://www.reddit.com/r/shiba.json?limit=777",
]
const duckLinks = ["https://www.reddit.com/r/duck.json?limit=777", "https://www.reddit.com/r/BACKYARDDUCKS.json?limit=777"]
const lizardLinks = [
    "https://www.reddit.com/r/Lizards.json?limit=777",
    "https://www.reddit.com/r/BeardedDragons.json?limit=777",
]
const rabbitLinks = ["https://www.reddit.com/r/rabbits.json?limit=777"]
const snekLinks = ["https://www.reddit.com/r/snek.json?limit=777"]

/**
 *
 * @param {Array<String>} links
 * @param {Map} imgs
 * @param {String} name
 */
async function cacheUpdate(links: Array<string>, name: string) {
    const start = new Date().getTime()

    const map: Map<string, object> = new Map()

    let amount = 0
    for (const link of links) {
        const res = await fetch(link).then((a) => a.json())

        if (res.message == "Forbidden") {
            logger.warn(`skipped ${link} due to private subreddit`)
            continue
        }

        let allowed

        try {
            allowed = res.data.children.filter((post) => !post.data.is_self)
        } catch {
            logger.error(`failed processing ${link}`)
        }

        if (allowed) {
            map.set(link, allowed)
            amount += allowed.length
        } else {
            logger.error(`no images @ ${link}`)
        }
    }

    images.set(name, map)

    const end = new Date().getTime()
    const total = (end - start) / 1000 + "s"
    logger.log({
        level: "img",
        message: `${amount.toLocaleString()} ${name} images loaded (${total})`,
    })
}

export async function updateCache() {
    const start = new Date().getTime()
    logger.log({
        level: "img",
        message: "img caches updating..",
    })
    await cacheUpdate(bdsmLinks, "bdsm")
    await cacheUpdate(thighsLinks, "thighs")
    await cacheUpdate(boobLinks, "boob")
    await cacheUpdate(assLinks, "ass")
    await cacheUpdate(pornLinks, "porn")
    await cacheUpdate(feetLinks, "feet")
    await cacheUpdate(birbLinks, "birb")
    await cacheUpdate(catLinks, "cat")
    await cacheUpdate(dogLinks, "dog")
    await cacheUpdate(duckLinks, "duck")
    await cacheUpdate(lizardLinks, "lizard")
    await cacheUpdate(rabbitLinks, "rabbit")
    await cacheUpdate(snekLinks, "snek")
    const end = new Date().getTime()
    const total = (end - start) / 1000 + "s"
    logger.log({
        level: "img",
        message: "images updated (" + total + ")",
    })
}

exports.images = images

export { images }
