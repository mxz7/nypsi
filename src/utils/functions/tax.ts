import ms = require("ms");
import redis from "../database/redis";

export async function getTax() {
    if (!(await redis.exists("nypsi:tax"))) {
        return await updateTax();
    } else {
        return parseFloat(await redis.get("nypsi:tax"));
    }
}

async function updateTax() {
    const tax = parseFloat((Math.random() * 5 + 5).toFixed(1));

    await redis.set("nypsi:tax", tax);
    await redis.expire("nypsi:tax", ms("16 hours"));

    return tax;
}
