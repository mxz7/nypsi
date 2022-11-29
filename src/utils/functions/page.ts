import {
  ActionRowBuilder,
  ButtonInteraction,
  ComponentType,
  Interaction,
  Message,
  MessageActionRowComponentBuilder,
} from "discord.js";
import { CustomEmbed } from "../../models/EmbedBuilders";

interface PageManagerOptions<T> {
  message: Message;
  row: ActionRowBuilder<MessageActionRowComponentBuilder>;
  arr?: T[];
  pages?: Map<number, T[]>;
  pageLength?: number;
  embed: CustomEmbed;
  updateEmbed?: (page: any[], embed: CustomEmbed) => CustomEmbed;
  userId: string;
  handleResponses?: Map<string, (data?: { manager: PageManager<T>; interaction: ButtonInteraction }) => Promise<void>>;
  onPageUpdate?: (manager: PageManager<T>) => CustomEmbed;
}

export default class PageManager<T> {
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

  public pages: Map<number, T[]>;
  public message: Message;
  public row: ActionRowBuilder<MessageActionRowComponentBuilder>;
  public currentPage = 1;
  public lastPage: number;
  public userId: string;
  public embed: CustomEmbed;
  public updatePageFunc: (page: T[], embed: CustomEmbed) => CustomEmbed;

  private filter: (i: Interaction) => boolean;
  private handleResponses: Map<
    string,
    (data?: { manager: PageManager<T>; interaction: ButtonInteraction }) => Promise<void>
  >;
  private onPageUpdate: (manager: PageManager<T>) => CustomEmbed;

  constructor(opts: PageManagerOptions<T>) {
    this.pages = opts.arr ? PageManager.createPages(opts.arr, opts.pageLength) : opts.pages;
    this.lastPage = this.pages.size;
    this.message = opts.message;
    this.row = opts.row;
    this.updatePageFunc = opts.updateEmbed;
    this.userId = opts.userId;
    this.embed = opts.embed;
    this.onPageUpdate = opts.onPageUpdate;

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

  private async back(data: { manager: PageManager<T> }): Promise<void> {
    if (data.manager.currentPage == 1) {
      return data.manager.listen();
    }

    data.manager.currentPage--;

    if (data.manager.updatePageFunc) {
      data.manager.embed = data.manager.updatePageFunc(data.manager.pages.get(data.manager.currentPage), data.manager.embed);
    } else {
      data.manager.embed = PageManager.defaultUpdateEmbed(
        data.manager.pages.get(data.manager.currentPage),
        data.manager.embed
      );
    }

    if (data.manager.onPageUpdate) {
      data.manager.embed = data.manager.onPageUpdate(data.manager);
    }

    if (data.manager.currentPage == 1) {
      data.manager.row.components[0].setDisabled(true);
    } else {
      data.manager.row.components[0].setDisabled(false);
    }

    data.manager.row.components[1].setDisabled(false);

    await data.manager.message.edit({ embeds: [data.manager.embed], components: [data.manager.row] });
    return data.manager.listen();
  }

  private async next(data: { manager: PageManager<T> }): Promise<void> {
    if (data.manager.currentPage == data.manager.lastPage) {
      return data.manager.listen();
    }

    data.manager.currentPage++;

    if (data.manager.updatePageFunc) {
      data.manager.embed = data.manager.updatePageFunc(data.manager.pages.get(data.manager.currentPage), data.manager.embed);
    } else {
      data.manager.embed = PageManager.defaultUpdateEmbed(
        data.manager.pages.get(data.manager.currentPage),
        data.manager.embed
      );
    }

    if (data.manager.onPageUpdate) {
      data.manager.embed = data.manager.onPageUpdate(data.manager);
    }

    if (data.manager.currentPage == data.manager.lastPage) {
      data.manager.row.components[1].setDisabled(true);
    } else {
      data.manager.row.components[1].setDisabled(false);
    }

    data.manager.row.components[0].setDisabled(false);

    await data.manager.message.edit({ embeds: [data.manager.embed], components: [data.manager.row] });
    return data.manager.listen();
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
      return this.handleResponses.get(res.customId)({ manager: this, interaction: res });
    }
  }

  private static defaultUpdateEmbed(page: any[], embed: CustomEmbed): CustomEmbed {
    embed.setDescription(page.join("\n"));

    return embed;
  }
}
