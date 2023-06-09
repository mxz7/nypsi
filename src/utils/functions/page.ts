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
  handleResponses?: Map<string, (manager: PageManager<T>, interaction: ButtonInteraction) => Promise<void>>;
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
  private handleResponses: Map<string, (manager: PageManager<T>, interaction: ButtonInteraction) => Promise<void>>;
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

  private async back(manager: PageManager<T>, interaction: ButtonInteraction): Promise<void> {
    await interaction.deferUpdate();
    if (manager.currentPage == 1) {
      return manager.listen();
    }

    manager.currentPage--;

    if (manager.updatePageFunc) {
      manager.embed = manager.updatePageFunc(manager.pages.get(manager.currentPage), manager.embed);
    } else {
      manager.embed = PageManager.defaultUpdateEmbed(manager.pages.get(manager.currentPage), manager.embed);
    }

    if (manager.onPageUpdate) {
      manager.embed = manager.onPageUpdate(manager);
    }

    if (manager.currentPage == 1) {
      manager.row.components[0].setDisabled(true);
    } else {
      manager.row.components[0].setDisabled(false);
    }

    manager.row.components[1].setDisabled(false);

    await manager.message.edit({ embeds: [manager.embed], components: [manager.row] });
    return manager.listen();
  }

  private async next(manager: PageManager<T>, interaction: ButtonInteraction): Promise<void> {
    await interaction.deferUpdate();
    if (manager.currentPage == manager.lastPage) {
      return manager.listen();
    }

    manager.currentPage++;

    if (manager.updatePageFunc) {
      manager.embed = manager.updatePageFunc(manager.pages.get(manager.currentPage), manager.embed);
    } else {
      manager.embed = PageManager.defaultUpdateEmbed(manager.pages.get(manager.currentPage), manager.embed);
    }

    if (manager.onPageUpdate) {
      manager.embed = manager.onPageUpdate(manager);
    }

    if (manager.currentPage == manager.lastPage) {
      manager.row.components[1].setDisabled(true);
    } else {
      manager.row.components[1].setDisabled(false);
    }

    manager.row.components[0].setDisabled(false);

    await manager.message.edit({ embeds: [manager.embed], components: [manager.row] });
    return manager.listen();
  }

  public async listen(): Promise<void> {
    const res = await this.message
      .awaitMessageComponent({ filter: this.filter, time: 90000, componentType: ComponentType.Button })
      .catch(() => {});

    if (!res) {
      await this.message.edit({ components: [] });
      return;
    }

    if (this.handleResponses.has(res.customId)) {
      return this.handleResponses.get(res.customId)(this, res);
    }
  }

  private static defaultUpdateEmbed(page: any[], embed: CustomEmbed): CustomEmbed {
    embed.setDescription(page.join("\n"));

    return embed;
  }
}
