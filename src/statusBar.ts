import { type IconName, setIcon } from "obsidian";

export class StatusBarAction {
    private el: HTMLSpanElement;
    private statusBar: StatusBar;
    private icon: HTMLSpanElement;
    private state: HTMLSpanElement;

    constructor(statusBar: StatusBar, iconId: IconName, state = "") {
        this.statusBar = statusBar;
        this.el = statusBar.el.createSpan({ cls: "action" });
        this.icon = this.el.createSpan({ cls: "action-icon" });
        setIcon(this.icon, iconId);
        this.state = this.el.createSpan({ cls: "action-state" });
        this.state.setText(state);
    }

    public start(): StatusBarAction {
        this.el.addClass("in-progress");
        return this;
    }

    public stop(): StatusBarAction {
        this.el.removeClass("in-progress");
        return this;
    }

    public updateState(state: string): StatusBarAction {
        this.state.setText(state);
        return this;
    }

    public done() {
        this.el.addClass("done");
        window.setTimeout(() => {
            this.statusBar.el.removeChild(this.el);
        }, 2000);
    }

    public failed() {
        this.el.addClass("failed");
        window.setTimeout(() => {
            this.statusBar.el.removeChild(this.el);
        }, 2000);
    }
}

export class StatusBar {
    el: HTMLElement;
    stats: HTMLSpanElement;

    constructor(el: HTMLElement) {
        this.el = el;
        this.el.ariaLabel = "GitHub stars";
        this.el.setAttr("data-tooltip-position", "top");
        const logo = this.el.createSpan({ cls: "logo" });
        setIcon(logo, "github");
        this.stats = this.el.createSpan({ cls: "stats" });
    }

    public updateStats(starred: number, unstarred?: number) {
        this.stats.empty();
        const statusBarStatsStarredCountIcon = this.stats.createSpan({
            cls: "starred-count-icon",
        });
        setIcon(statusBarStatsStarredCountIcon, "star");
        const statusBarStatsStarredCount = this.stats.createSpan({
            cls: "starred-count",
        });
        statusBarStatsStarredCount.ariaLabel = "Starred repositories";
        statusBarStatsStarredCount.setAttr("data-tooltip-position", "top");
        statusBarStatsStarredCount.setText(starred.toString());

        if (unstarred) {
            const statusBarStatsUnstarredCountIcon = this.stats.createSpan({
                cls: "unstarred-count-icon",
            });
            setIcon(statusBarStatsUnstarredCountIcon, "star-off");
            const statusBarStatsUnstarredCount = this.stats.createSpan({
                cls: "unstarred-count",
            });
            statusBarStatsUnstarredCount.ariaLabel = "Unstarred repositories";
            statusBarStatsUnstarredCount.setAttr(
                "data-tooltip-position",
                "top",
            );
            statusBarStatsUnstarredCount.setText(unstarred.toString());
        }
    }
}
