const fetch = require("node-fetch")
const { getTimestamp } = require("./utils")

const pornCache = new Map()
const bdsmCache = new Map()
const assCache = new Map()
const thighsCache = new Map()
const birbCache = new Map()
const catCache = new Map()
const dogCache = new Map()
const rabbitCache = new Map()
const snekCache = new Map()

const bdsmLinks = ["https://www.reddit.com/r/bdsm.json?limit=777", "https://www.reddit.com/r/bondage.json?limit=777", "https://www.reddit.com/r/dominated.json?limit=777"]
const thighsLinks = ["https://www.reddit.com/r/legs.json?limit=777",
    "https://www.reddit.com/r/thickthighs.json?limit=777",
    "https://www.reddit.com/r/perfectthighs.json?limit=777",
    "https://www.reddit.com/r/thighs.json?limit=777"]
const assLinks = ["https://www.reddit.com/r/ass.json?limit=777",
    "https://www.reddit.com/r/asstastic.json?limit=777",
    "https://www.reddit.com/r/facedownassup.json?limit=777",
    "https://www.reddit.com/r/assinthong.json?limit=777",
    "https://www.reddit.com/r/buttplug.json?limit=777",
    "https://www.reddit.com/r/TheUnderbun.json?limit=777",
    "https://www.reddit.com/r/booty.json?limit=777",
    "https://www.reddit.com/r/HungryButts.json?limit=777",
    "https://www.reddit.com/r/whooties.json?limit=777"]
const pornLinks = ["https://www.reddit.com/r/collegesluts.json?limit=777", 
    "https://www.reddit.com/r/realgirls.json?limit=777", 
    "https://www.reddit.com/r/legalteens.json?limit=777",
    "https://www.reddit.com/r/amateur.json?limit=777",
    "https://www.reddit.com/r/nsfw_snapchat.json?limit=777",
    "https://www.reddit.com/r/wet.json?limit=777",
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
    "https://www.reddit.com/r/creampies.json?limit=777"]
const birbLinks = ["https://www.reddit.com/r/birb.json?limit=777", 
    "https://www.reddit.com/r/budgies.json?limit=777",
    "https://www.reddit.com/r/parrots.json?limit=777"]
const catLinks = ["https://www.reddit.com/r/cat.json?limit=777",
    "https://www.reddit.com/r/kittens.json?limit=777"]
const dogLinks = ["https://www.reddit.com/r/dog.json?limit=777",
    "https://www.reddit.com/r/corgi.json?limit=777",
    "https://www.reddit.com/r/dogpictures.json?limit=777",
    "https://www.reddit.com/r/goldenretrievers.json?limit=777",
    "https://www.reddit.com/r/shiba.json?limit=777"]
const rabbitLinks = ["https://www.reddit.com/r/rabbits.json?limit=777"]
const snekLinks = ["https://www.reddit.com/r/snek.json?limit=777"]

async function bdsmUpdate() {
    const start = new Date().getTime()
    for (link of bdsmLinks) {
        const res = await fetch(link).then(a => a.json())
        
        const allowed = res.data.children.filter(post => !post.data.is_self)
        if (allowed) {
            bdsmCache.set(link, allowed)
        } else {
            console.error("no images @ " + link)
        }
    }
    const end = new Date().getTime()
    const total = ((end - start) / 1000) + "s"
    console.log("\x1b[32m[" + getTimestamp() + "] bdsm cache loaded (" + total + ")\x1b[37m")
    exports.bdsmCache = bdsmCache
}

async function assUpdate() {
    const start = new Date().getTime()
    for (link of assLinks) {
        const res = await fetch(link).then(a => a.json())
        
        const allowed = res.data.children.filter(post => !post.data.is_self)
        if (allowed) {
            assCache.set(link, allowed)
        } else {
            console.error("no images @ " + link)
        }
    }
    const end = new Date().getTime()
    const total = ((end - start) / 1000) + "s"
    console.log("\x1b[32m[" + getTimestamp() + "] ass cache loaded (" + total + ")\x1b[37m")
    exports.assCache = assCache
}

async function thighsUpdate() {
    const start = new Date().getTime()
    for (link of thighsLinks) {
        const res = await fetch(link).then(a => a.json())
        
        const allowed = res.data.children.filter(post => !post.data.is_self)
        if (allowed) {
            thighsCache.set(link, allowed)
        } else {
            console.error("no images @ " + link)
        }
    }
    const end = new Date().getTime()
    const total = ((end - start) / 1000) + "s"
    console.log("\x1b[32m[" + getTimestamp() + "] thigh cache loaded (" + total + ")\x1b[37m")
    exports.thighsCache = thighsCache
}

async function pornUpdate() {
    const start = new Date().getTime()
    for (link of pornLinks) {
        const res = await fetch(link).then(a => a.json())
        
        const allowed = res.data.children.filter(post => !post.data.is_self)
        if (allowed) {
            pornCache.set(link, allowed)
        } else {
            console.error("no images @ " + link)
        }
    }
    const end = new Date().getTime()
    const total = ((end - start) / 1000) + "s"
    console.log("\x1b[32m[" + getTimestamp() + "] porn cache loaded (" + total + ")\x1b[37m")
    exports.pornCache = pornCache
}

async function birbUpdate() {
    const start = new Date().getTime()
    for (link of birbLinks) {
        const res = await fetch(link).then(a => a.json())
        
        const allowed = res.data.children.filter(post => !post.data.is_self)

        if (allowed) {
            birbCache.set(link, allowed)
        } else {
            console.error("no images @ " + link)
        }
    }
    const end = new Date().getTime()
    const total = ((end - start) / 1000) + "s"
    console.log("\x1b[32m[" + getTimestamp() + "] birb cache loaded (" + total + ")\x1b[37m")
    exports.birbCache = birbCache
}

async function catUpdate() {
    const start = new Date().getTime()
    for (link of catLinks) {
        const res = await fetch(link).then(a => a.json())
        
        const allowed = res.data.children.filter(post => !post.data.is_self)

        if (allowed) {
            catCache.set(link, allowed)
        } else {
            console.error("no images @ " + link)
        }
    }
    const end = new Date().getTime()
    const total = ((end - start) / 1000) + "s"
    console.log("\x1b[32m[" + getTimestamp() + "] cat cache loaded (" + total + ")\x1b[37m")
    exports.catCache = catCache
}

async function dogUpdate() {
    const start = new Date().getTime()
    for (link of dogLinks) {
        const res = await fetch(link).then(a => a.json())
        
        const allowed = res.data.children.filter(post => !post.data.is_self)

        if (allowed) {
            dogCache.set(link, allowed)
        } else {
            console.error("no images @ " + link)
        }
    }
    const end = new Date().getTime()
    const total = ((end - start) / 1000) + "s"
    console.log("\x1b[32m[" + getTimestamp() + "] dog cache loaded (" + total + ")\x1b[37m")
    exports.dogCache = dogCache
}

async function rabbitUpdate() {
    const start = new Date().getTime()
    for (link of rabbitLinks) {
        const res = await fetch(link).then(a => a.json())
        
        const allowed = res.data.children.filter(post => !post.data.is_self)

        if (allowed) {
            rabbitCache.set(link, allowed)
        } else {
            console.error("no images @ " + link)
        }
    }
    const end = new Date().getTime()
    const total = ((end - start) / 1000) + "s"
    console.log("\x1b[32m[" + getTimestamp() + "] rabbit cache loaded (" + total + ")\x1b[37m")
    exports.rabbitCache = rabbitCache
}

async function snekUpdate() {
    const start = new Date().getTime()
    for (link of snekLinks) {
        const res = await fetch(link).then(a => a.json())
        
        const allowed = res.data.children.filter(post => !post.data.is_self)

        if (allowed) {
            snekCache.set(link, allowed)
        } else {
            console.error("no images @ " + link)
        }
    }
    const end = new Date().getTime()
    const total = ((end - start) / 1000) + "s"
    console.log("\x1b[32m[" + getTimestamp() + "] snek cache loaded (" + total + ")\x1b[37m")
    exports.snekCache = snekCache
}

async function updateCache() {
    const start = new Date().getTime()
    console.log("\x1b[32m[" + getTimestamp() + "] img caches updating..\x1b[37m")
    await bdsmUpdate()
    await assUpdate()
    await thighsUpdate()
    await pornUpdate()
    await birbUpdate()
    await catUpdate()
    await dogUpdate()
    await rabbitUpdate()
    await snekUpdate()
    const end = new Date().getTime()
    const total = ((end - start) / 1000) + "s"
    console.log("\x1b[32m[" + getTimestamp() + "] img caches updated (" + total + ")\x1b[37m")
}

exports.updateCache = updateCache