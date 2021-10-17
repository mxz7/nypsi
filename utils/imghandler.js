const fetch = require("node-fetch")
const { error, info, types } = require("./logger")

const pornCache = new Map()
const bdsmCache = new Map()
const boobCache = new Map()
const assCache = new Map()
const thighsCache = new Map()
const birbCache = new Map()
const catCache = new Map()
const dogCache = new Map()
const duckCache = new Map()
const lizardCache = new Map()
const rabbitCache = new Map()
const snekCache = new Map()

const bdsmLinks = [
    "https://www.reddit.com/r/bdsm.json?limit=777",
    "https://www.reddit.com/r/bondage.json?limit=777",
    "https://www.reddit.com/r/dominated.json?limit=777",
]
const thighsLinks = [
    "https://www.reddit.com/r/legs.json?limit=777",
    "https://www.reddit.com/r/thickthighs.json?limit=777",
    "https://www.reddit.com/r/perfectthighs.json?limit=777",
    "https://www.reddit.com/r/thighs.json?limit=777",
]
const boobLinks = [
    "https://www.reddit.com/r/Boobies.json?limit=777",
    "https://www.reddit.com/r/cleavage.json?limit=777",
    "https://www.reddit.com/r/tits.json?limit=777",
    "https://www.reddit.com/r/TinyTits.json?limit=777",
]
const assLinks = [
    "https://www.reddit.com/r/ass.json?limit=777",
    "https://www.reddit.com/r/asstastic.json?limit=777",
    "https://www.reddit.com/r/facedownassup.json?limit=777",
    "https://www.reddit.com/r/assinthong.json?limit=777",
    "https://www.reddit.com/r/buttplug.json?limit=777",
    "https://www.reddit.com/r/TheUnderbun.json?limit=777",
    "https://www.reddit.com/r/booty.json?limit=777",
    "https://www.reddit.com/r/HungryButts.json?limit=777",
    "https://www.reddit.com/r/whooties.json?limit=777",
    "https://www.reddit.com/r/WhiteCheeks.json?limit=777",
    "https://www.reddit.com/r/AssholeBehindThong.json?limit=777",
    "https://www.reddit.com/r/WomenBendingOver.json?limit=777",
    "https://www.reddit.com/r/thickwhitegirls.json?limit=777",
]
const pornLinks = [
    "https://www.reddit.com/r/collegesluts.json?limit=777",
    "https://www.reddit.com/r/realgirls.json?limit=777",
    "https://www.reddit.com/r/legalteens.json?limit=777",
    "https://www.reddit.com/r/amateur.json?limit=777",
    "https://www.reddit.com/r/nsfw_snapchat.json?limit=777",
    "https://www.reddit.com/r/bathing.json?limit=777",
    "https://www.reddit.com/r/porngifs.json?limit=777",
    "https://www.reddit.com/r/gonewild.json?limit=777",
    "https://www.reddit.com/r/gonewild18.json?limit=777",
    "https://www.reddit.com/r/collegeamateurs.json?limit=777",
    "https://www.reddit.com/r/irlgirls.json?limit=777",
    "https://www.reddit.com/r/camwhores.json?limit=777",
    "https://www.reddit.com/r/camsluts.json?limit=777",
    "https://www.reddit.com/r/cumsluts.json?limit=777",
    "https://www.reddit.com/r/cumfetish.json?limit=777",
    "https://www.reddit.com/r/creampies.json?limit=777",
    "https://www.reddit.com/r/Phatasswhitegirls.json?limit=777",
]
const birbLinks = [
    "https://www.reddit.com/r/birb.json?limit=777",
    "https://www.reddit.com/r/budgies.json?limit=777",
    "https://www.reddit.com/r/parrots.json?limit=777",
]
const catLinks = ["https://www.reddit.com/r/cat.json?limit=777", "https://www.reddit.com/r/kittens.json?limit=777"]
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
async function cacheUpdate(links, imgs, name) {
    const start = new Date().getTime()
    let amount = 0
    for (let link of links) {
        const res = await fetch(link).then((a) => a.json())

        if (res.message == "Forbidden") {
            error(`skipped ${link} due to private subreddit`)
            continue
        }

        const allowed = res.data.children.filter((post) => !post.data.is_self)
        if (allowed) {
            imgs.set(link, allowed)
            amount += allowed.length
        } else {
            error(`no images @ ${link}`)
        }
    }
    const end = new Date().getTime()
    const total = (end - start) / 1000 + "s"
    info(`${amount} ${name} images loaded (${total})`, types.IMAGE)
}

async function updateCache() {
    const start = new Date().getTime()
    info("img caches updating..", types.IMAGE)
    await cacheUpdate(bdsmLinks, bdsmCache, "bdsm")
    exports.bdsmCache = bdsmCache
    await cacheUpdate(thighsLinks, thighsCache, "thighs")
    exports.thighsCache = thighsCache
    await cacheUpdate(boobLinks, boobCache, "boob")
    exports.boobCache = boobCache
    await cacheUpdate(assLinks, assCache, "ass")
    exports.assCache = assCache
    await cacheUpdate(pornLinks, pornCache, "porn")
    exports.pornCache = pornCache
    await cacheUpdate(birbLinks, birbCache, "birb")
    exports.birbCache = birbCache
    await cacheUpdate(catLinks, catCache, "cat")
    exports.catCache = catCache
    await cacheUpdate(dogLinks, dogCache, "dog")
    exports.dogCache = dogCache
    await cacheUpdate(duckLinks, duckCache, "duck")
    exports.duckCache = duckCache
    await cacheUpdate(lizardLinks, lizardCache, "lizard")
    exports.lizardCache = lizardCache
    await cacheUpdate(rabbitLinks, rabbitCache, "rabbit")
    exports.rabbitCache = rabbitCache
    await cacheUpdate(snekLinks, snekCache, "snek")
    exports.snekCache = snekCache
    const end = new Date().getTime()
    const total = (end - start) / 1000 + "s"
    info("images updated (" + total + ")", types.IMAGE)
}

exports.updateCache = updateCache
