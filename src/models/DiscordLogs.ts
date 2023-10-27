import { ColorResolvable, EmbedBuilder, WebhookClient } from "discord.js";
import { Levels, Transport, WriteData } from "../utils/logger";

type Mode = "codeblock" | "embed" | "hybrid" | "standard";

function postEmbeds(queue: EmbedBuilder[], hook: WebhookClient) {
  const embeds = [];
  while (embeds.length < 10 && queue.length > 0) {
    embeds.push(queue.shift());
  }

  if (embeds.length == 0) return;

  return hook.send({ embeds });
}

export default class DiscordTransport implements Transport {
  public levels: Levels[];
  private mode: Mode;
  private interval: number;
  private colors: Map<string, string>;
  private maxLength: number;
  private queue: (string | EmbedBuilder)[];
  private hook: WebhookClient;
  private formatter: (data: WriteData) => Promise<string> | string;

  constructor(opts: {
    webhook: string;
    mode?: Mode;
    interval?: number;
    maxLength?: number;
    colors?: Map<string, string>;
    formatter?: (data: WriteData) => Promise<string> | string;
    levels: Levels[];
  }) {
    if (!opts.webhook) {
      throw new Error("No webhook given for Discord Transport");
    }

    this.levels = opts.levels;
    if (opts.formatter) {
      this.formatter = opts.formatter;
    } else {
      this.formatter = (d) => d.message;
    }

    /**
     * @type {boolean}
     */
    this.mode = opts.mode || "hybrid";
    this.colors = opts.colors || new Map();

    /**
     * @type {number}
     */
    this.interval = opts.interval || 2500;

    /**
     * @type {number}
     */
    this.maxLength = opts.maxLength || 500;

    this.queue = [];
    this.hook = new WebhookClient({ url: opts.webhook });

    if (this.mode == "embed" || this.mode == "hybrid") {
      setInterval(() => {
        postEmbeds(this.queue as EmbedBuilder[], this.hook);
      }, this.interval);
    } else {
      setInterval(() => {
        const content = [];

        while (content.join("\n").length < this.maxLength) {
          content.push(this.queue.shift());
        }

        if (content.join("\n").length > this.maxLength) {
          this.queue = [content.pop(), ...this.queue];
        }

        if (content.length == 0) return;

        if (content.length > 0) {
          this.hook.send({ content: content.join("\n") });
        }
      }, this.interval);
    }
  }

  public async write(data: WriteData): Promise<void> {
    const items: string[] = [];

    let formatted = data.meta.nypsi_formatted ? data.message : await this.formatter(data);

    while (formatted.length > this.maxLength) {
      const section = formatted.substring(0, this.maxLength);
      formatted = formatted.substring(this.maxLength);
      items.push(section);
    }

    items.push(formatted);

    if (["hybrid", "embed"].includes(this.mode)) {
      for (const entry of items) {
        const embed = new EmbedBuilder();

        if (this.colors.has(data.label))
          embed.setColor(this.colors.get(data.label) as ColorResolvable);

        if (this.mode == "hybrid") {
          embed.setDescription(`\`\`\`ansi\n${entry}\`\`\``);
        } else {
          embed.setDescription(`${entry}`);
        }
        this.queue.push(embed);
      }
    } else if (this.mode == "codeblock") {
      for (const entry of items) this.queue.push(`\`\`\`ansi\n${entry}\`\`\``);
    } else {
      for (const entry of items) this.queue.push(entry);
    }
  }
}
