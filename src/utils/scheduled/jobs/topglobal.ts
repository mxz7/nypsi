import { WebhookClient } from "discord.js";
import { topAmountGlobal } from "../../economy/utils";
import { logger } from "../../logger";
import { CustomEmbed } from "../../models/EmbedBuilders";

(async () => {
    const baltop = await topAmountGlobal(10, undefined, true);

    const embed = new CustomEmbed();

    embed.setTitle("top 10 richest users");
    embed.setDescription(baltop.join("\n"));
    embed.setColor("#111111");
    embed.disableFooter();

    const hook = new WebhookClient({ url: process.env.TOPGLOBAL_HOOK });

    await hook
        .send({ embeds: [embed] })
        .then(() => {
            logger.log({
                level: "auto",
                message: "sent global bal top",
            });
        })
        .catch(() => {
            logger.error("failed to send gobal bal top");
        });
})();
