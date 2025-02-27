import type GithubStarsPlugin from "@/main";
import {
    type App,
    type Debouncer,
    PluginSettingTab,
    Setting,
    debounce,
    normalizePath,
} from "obsidian";
import { isUndefined } from "./helpers";

export interface PluginSettings {
    pageSize: number;
    accessToken: string;
    destinationFolder: string;
    indexPageByOwnersFileName: string;
    indexPageByDaysFileName: string;
    indexPageByLanguagesFileName: string;
    dbFileName: string;
    [key: string]: unknown;
}

export const DEFAULT_SETTINGS: PluginSettings = {
    pageSize: 50,
    accessToken: "",
    destinationFolder: normalizePath("GitHub"),
    indexPageByOwnersFileName: "Stars by owners.md",
    indexPageByDaysFileName: "Stars by days.md",
    indexPageByLanguagesFileName: "Stars by languages.md",
    dbFileName: "stars.db",
};

export class SettingsTab extends PluginSettingTab {
    plugin: GithubStarsPlugin;
    protected debouncedUpdateSettings?: Debouncer<
        [Partial<PluginSettings>],
        Promise<void>
    >;
    private inProgressCssClass = "save-in-progress";
    private accessTokenSetting?: Setting;
    private pageSizeSetting?: Setting;
    private destinationFolderSetting?: Setting;

    constructor(app: App, plugin: GithubStarsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.initSettings();
    }

    async updateSettings(newSettings: Partial<PluginSettings>) {
        if (isUndefined(this.debouncedUpdateSettings)) {
            this.debouncedUpdateSettings = debounce(
                async (settings: Partial<PluginSettings>) => {
                    this.containerEl.addClass(this.inProgressCssClass);
                    this.accessTokenSetting?.setDisabled(true);
                    this.pageSizeSetting?.setDisabled(true);
                    this.destinationFolderSetting?.setDisabled(true);

                    await this.plugin.updateSettings(settings);

                    this.accessTokenSetting?.setDisabled(false);
                    this.pageSizeSetting?.setDisabled(false);
                    this.destinationFolderSetting?.setDisabled(false);
                    this.containerEl.removeClass(this.inProgressCssClass);
                    this.redraw();
                },
                1000,
                true,
            );
        }
        return this.debouncedUpdateSettings(newSettings);
    }

    private initSettings() {
        const { containerEl } = this;
        this.accessTokenSetting = new Setting(containerEl).setName(
            "GitHub API access token",
        );
        this.pageSizeSetting = new Setting(containerEl)
            .setName("API query page size")
            .setDesc(
                "GitHub GraphQL API request page size. In range from 1 to 100.",
            );
        this.destinationFolderSetting = new Setting(containerEl)
            .setName("Destination folder")
            .setDesc(
                "Folder inside your vault where new documents will be created. Relative to your vault root.",
            );
    }

    public redraw() {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.addClasses([this.plugin.manifest.id, "settings"]);

        this.initSettings();

        this.accessTokenSetting?.addText((text) => {
            text.inputEl.setAttr("type", "password");
            text.setValue(this.plugin.settings.accessToken).onChange(
                async (value) =>
                    this.updateSettings({
                        accessToken: value,
                    }),
            );
        });

        this.pageSizeSetting?.addText((text) => {
            text.inputEl.setAttr("type", "number");
            text.inputEl.setAttr("min", "1");
            text.inputEl.setAttr("max", "100");
            text.setValue(this.plugin.settings.pageSize.toString()).onChange(
                async (value) =>
                    this.updateSettings({
                        pageSize: Number.parseInt(value),
                    }),
            );
        });

        this.destinationFolderSetting?.addText((text) => {
            text.setValue(this.plugin.settings.destinationFolder).onChange(
                async (value) =>
                    this.updateSettings({
                        destinationFolder: normalizePath(value),
                    }),
            );
        });
    }

    override display(): void {
        this.redraw();
    }
}
