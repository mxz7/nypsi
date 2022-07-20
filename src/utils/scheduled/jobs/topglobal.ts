import { WebhookClient } from "discord.js";
import { parentPort } from "worker_threads";
import { topAmountGlobal } from "../../economy/utils";
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
            parentPort.postMessage("sent global baltop");
            process.exit(0);
        })
        .catch(() => {
            parentPort.postMessage("failed to send global baltop");
            process.exit(1);
        });
})();
