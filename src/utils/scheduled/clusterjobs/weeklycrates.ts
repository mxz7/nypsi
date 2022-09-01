import prisma from "../../database/database";
import { getInventory, setInventory, userExists } from "../../economy/utils";
import { MStoTime } from "../../functions/date";
import requestDM from "../../functions/requestdm";
import { logger } from "../../logger";
import { NypsiClient } from "../../models/Client";
import { CustomEmbed } from "../../models/EmbedBuilders";

async function doCrates(client: NypsiClient) {
    const query = await prisma.premium.findMany({
        where: {
            AND: [
                {
                    status: 1,
                },
                {
                    level: { gt: 1 },
                },
            ],
        },
        select: {
            userId: true,
            level: true,
        },
    });

    for (const member of query) {
        if (!(await userExists(member.userId))) continue;
        const inventory = await getInventory(member.userId);

        if (member.level == 2) {
            if (inventory["basic_crate"]) {
                inventory["basic_crate"] += 1;
            } else {
                inventory["basic_crate"] = 1;
            }

            const embed = new CustomEmbed().setHeader("thank you for supporting nypsi!").setColor("#5efb8f");

            embed.setDescription("you have received 1 **basic crate** 🙂");

            await requestDM({
                client: client,
                memberId: member.userId,
                content: "enjoy your weekly crate (:",
                embed: embed,
            }).catch(() => {});
        } else if (member.level == 3) {
            if (inventory["basic_crate"]) {
                inventory["basic_crate"] += 2;
            } else {
                inventory["basic_crate"] = 2;
            }

            const embed = new CustomEmbed().setHeader("thank you for supporting nypsi!").setColor("#5efb8f");

            embed.setDescription("you have received 2 **basic crates** 🙂");

            await requestDM({
                client: client,
                memberId: member.userId,
                content: "enjoy your weekly crates (:",
                embed: embed,
            }).catch(() => {});
        } else if (member.level == 4) {
            if (inventory["basic_crate"]) {
                inventory["basic_crate"] += 2;
            } else {
                inventory["basic_crate"] = 2;
            }

            if (inventory["69420_crate"]) {
                inventory["69420_crate"] += 1;
            } else {
                inventory["69420_crate"] = 1;
            }

            const embed = new CustomEmbed().setHeader("thank you for supporting nypsi!").setColor("#5efb8f");

            embed.setDescription("you have received 2 **basic crates** and 1 **69420 crate** 🙂");

            await requestDM({
                client: client,
                memberId: member.userId,
                content: "enjoy your weekly crates (:",
                embed: embed,
            }).catch(() => {});
        }

        await setInventory(member.userId, inventory);
    }
}

export function runPremiumCrateInterval(client: NypsiClient) {
    const now = new Date();
    const saturday = new Date();
    saturday.setDate(now.getDate() + ((6 - 1 - now.getDay() + 7) % 7) + 1);
    saturday.setHours(0, 10, 0, 0);

    const needed = saturday.getTime() - now.getTime();

    setTimeout(() => {
        doCrates(client);
        setInterval(() => {
            doCrates(client);
        }, 86400 * 1000 * 7);
    }, needed);

    logger.log({
        level: "auto",
        message: `premium crates will run in ${MStoTime(needed)}`,
    });
}
