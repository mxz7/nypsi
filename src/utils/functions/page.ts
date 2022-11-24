import { ActionRowBuilder, ComponentType, Interaction, Message, MessageActionRowComponentBuilder } from "discord.js";
import { CustomEmbed } from "../../models/EmbedBuilders";

interface PageManagerOptions {
  message: Message;
  row: ActionRowBuilder<MessageActionRowComponentBuilder>;
  arr: unknown[];
  pageLength?: number;
  embed: CustomEmbed;
  updateEmbed?: (page: unknown[], embed: CustomEmbed) => CustomEmbed;
  userId: string;
  handleResponses: Map<string, (data?: PageManager) => Promise<void>>;
}

export default class PageManager {
  static createPages<T>(arr: T[], pageLength = 10): Map<number, T[]> {
    const map = new Map<number, T[]>();

    for (const item of arr) {
      if (map.size == 0) {
        map.set(1, [item]);
      } else {
        if (map.get(map.size).length >= pageLength) {
          map.set(map.size + 1, [item]);
        } else {
          map.get(map.size).push(item);
        }
      }
    }

    return map;
  }

  public pages: Map<number, unknown[]>;
  public message: Message;
  public row: ActionRowBuilder<MessageActionRowComponentBuilder>;
  public currentPage = 1;
  public lastPage: number;
  public userId: string;
  public embed: CustomEmbed;

  private updatePageFunc: (page: unknown[], embed: CustomEmbed) => CustomEmbed;
  private filter: (i: Interaction) => boolean;
  private handleResponses: Map<string, (data?: PageManager) => Promise<void>>;

  constructor(opts: PageManagerOptions) {
    this.pages = PageManager.createPages(opts.arr, opts.pageLength);
    this.lastPage = this.pages.size;
    this.message = opts.message;
    this.row = opts.row;
    this.updatePageFunc = opts.updateEmbed;
    this.userId = opts.userId;
    this.embed = opts.embed;

    this.filter = (i: Interaction) => i.user.id == this.userId;

    this.handleResponses = new Map();

    this.handleResponses.set("⬅", this.back);
    this.handleResponses.set("➡", this.next);

    if (opts.handleResponses) {
      for (const [k, v] of opts.handleResponses.entries()) {
        this.handleResponses.set(k, v);
      }
    }
  }

  private async back(): Promise<void> {
    if (this.currentPage == 1) {
      return this.listen();
    }

    this.currentPage--;

    if (this.updatePageFunc) {
      this.embed = this.updatePageFunc(this.pages.get(this.currentPage), this.embed);
    } else {
      this.embed = PageManager.defaultUpdateEmbed(this.pages.get(this.currentPage), this.embed);
    }

    if (this.currentPage == 1) {
      this.row.components[0].setDisabled(true);
    } else {
      this.row.components[0].setDisabled(false);
    }

    await this.message.edit({ embeds: [this.embed], components: [this.row] });
    return this.listen();
  }

  private async next(): Promise<void> {
    if (this.currentPage == this.lastPage) {
      return this.listen();
    }

    this.currentPage++;

    if (this.updatePageFunc) {
      this.embed = this.updatePageFunc(this.pages.get(this.currentPage), this.embed);
    } else {
      this.embed = PageManager.defaultUpdateEmbed(this.pages.get(this.currentPage), this.embed);
    }

    if (this.currentPage == this.lastPage) {
      this.row.components[1].setDisabled(true);
    } else {
      this.row.components[1].setDisabled(false);
    }

    await this.message.edit({ embeds: [this.embed], components: [this.row] });
    return this.listen();
  }

  public async listen(): Promise<void> {
    const res = await this.message
      .awaitMessageComponent({ filter: this.filter, time: 90000, componentType: ComponentType.Button })
      .catch(() => {});

    if (!res) {
      await this.message.edit({ components: [] });
      return;
    }

    await res.deferUpdate();

    if (this.handleResponses.has(res.customId)) {
      return this.handleResponses.get(res.customId)(this);
    }
  }

  private static defaultUpdateEmbed(page: unknown[], embed: CustomEmbed): CustomEmbed {
    embed.setDescription(page.join("\n"));

    return embed;
  }
}
