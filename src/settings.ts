import { type App, PluginSettingTab, Setting, normalizePath } from "obsidian";
import type GithubStarsPlugin from "./main";

export class SettingsTab extends PluginSettingTab {
    plugin: GithubStarsPlugin;

    constructor(app: App, plugin: GithubStarsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    override display(): void {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.createEl("h1", { text: "GitHub stars" });

        const accessTokenSetting = new Setting(containerEl).setName(
            "GitHub API access token",
        );
        accessTokenSetting.addText((text) => {
            text.setValue(this.plugin.settings.accessToken).onChange(
                async (value) => {
                    this.plugin.settings.accessToken = value;
                    await this.plugin.saveSettings();
                },
            );
        });
        accessTokenSetting.controlEl.children[0].setAttr("type", "password");

        const pageSizeSetting = new Setting(containerEl)
            .setName("API query page size")
            .setDesc(
                "GitHub GraphQL API request page size. In range from 1 to 100.",
            );
        pageSizeSetting.addText((text) =>
            text
                .setValue(this.plugin.settings.pageSize.toString())
                .onChange(async (value) => {
                    let parsedValue = Number.parseInt(value);
                    if (parsedValue < 1) {
                        parsedValue = 1;
                    }
                    if (parsedValue > 100) {
                        parsedValue = 100;
                    }
                    this.plugin.settings.pageSize = parsedValue;
                    await this.plugin.saveSettings();
                }),
        );
        const pageSizeInputEl = pageSizeSetting.controlEl.children[0];
        pageSizeInputEl.setAttr("type", "number");
        pageSizeInputEl.setAttr("min", "1");
        pageSizeInputEl.setAttr("max", "100");

        new Setting(containerEl)
            .setName("Destination folder")
            .setDesc(
                "Folder inside your vault where new documents will be created. Relative to your vault root.",
            )
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.destinationFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.destinationFolder =
                            normalizePath(value);
                        await this.plugin.saveSettings();
                    }),
            );
    }
}
