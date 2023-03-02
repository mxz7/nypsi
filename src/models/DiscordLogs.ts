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
    this.maxLength = opts.maxLength || 1900;

    this.queue = [];
    this.hook = new WebhookClient({ url: opts.webhook });

    if (this.mode == "embed" || this.mode == "hybrid") {
      setInterval(() => {
        postEmbeds(this.queue as EmbedBuilder[], this.hook);
      }, this.interval);
    } else {
      setInterval(() => {
        const content = [];

        while (content.length < this.maxLength) {
          content.push(this.queue.shift());
        }

        if (content.length == 0) return;

        if (content.length > 0) {
          this.hook.send({ content: content.join("\n") });
        }
      }, this.interval);
    }
  }

  public async write(data: WriteData) {
    const doThing = (message: string): void => {
      let repeat = false;
      let next = "";

      if (message.length > 1500) {
        repeat = true;
        next = message.substring(1500, message.length - 1500);
        message = message.substring(0, 1500);
      }

      if (["hybrid", "embed"].includes(this.mode)) {
        const embed = new EmbedBuilder();

        if (this.colors.has(data.label)) embed.setColor(this.colors.get(data.label) as ColorResolvable);

        if (this.mode == "hybrid") {
          embed.setDescription(`\`\`\`${this.formatter(data)}\`\`\``);
        } else {
          embed.setDescription(`${this.formatter(data)}`);
        }
        this.queue.push(embed);
      } else if (this.mode == "codeblock") {
        this.queue.push(`\`\`\`${this.formatter(data)}\`\`\``);
      } else {
        this.queue.push(`${this.formatter(data)}`);
      }

      if (repeat) return doThing(next);
    };

    const formatted = await this.formatter(data);

    doThing(formatted);
    return;
  }
}
