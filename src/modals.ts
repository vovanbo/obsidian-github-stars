import type { PromiseResolve } from "@/types";
import { type App, ButtonComponent, Modal } from "obsidian";

export interface ConfirmOptions {
    /**
     * The Obsidian app instance.
     */
    app: App;

    /**
     * The text for the "Cancel" button.
     */
    cancelButtonText?: string;

    /**
     * The message to display in the modal.
     */
    message: DocumentFragment | string;

    /**
     * The text for the "OK" button.
     */
    okButtonText?: string;

    /**
     * The title of the modal.
     */
    title?: DocumentFragment | string;
}

class ConfirmModal extends Modal {
    private isConfirmed = false;
    private options: Required<ConfirmOptions>;

    public constructor(
        options: ConfirmOptions,
        protected resolve: PromiseResolve<boolean>,
    ) {
        super(options.app);
        const DEFAULT_OPTIONS: Required<ConfirmOptions> = {
            app: options.app,
            cancelButtonText: "Cancel",
            message: options.message,
            okButtonText: "OK",
            title: "",
        };
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    public override onClose(): void {
        this.resolve(this.isConfirmed);
    }

    public override onOpen(): void {
        this.containerEl.addClass("obsidian-github-stars");
        this.titleEl.setText(this.options.title);
        const contentWrapper = this.contentEl.createEl("div", {
            cls: "modal-content-wrapper",
        });
        contentWrapper.innerHTML = this.options.message as string;
        const buttonsWrapper = this.contentEl.createEl("div", {
            cls: "modal-buttons-wrapper",
        });
        const okButton = new ButtonComponent(buttonsWrapper);
        okButton.setButtonText(this.options.okButtonText);
        okButton.setCta();
        okButton.onClick(() => {
            this.isConfirmed = true;
            this.close();
        });
        okButton.setClass("ok-button");

        const cancelButton = new ButtonComponent(buttonsWrapper);
        cancelButton.setButtonText(this.options.cancelButtonText);
        cancelButton.onClick(this.close.bind(this));
        cancelButton.setClass("cancel-button");
    }
}

export async function showModal<T>(
    modalCreator: (resolve: PromiseResolve<T>) => Modal,
): Promise<T> {
    return await new Promise<T>((resolve) => {
        const modal = modalCreator(resolve);
        modal.open();
    });
}

export async function confirm(options: ConfirmOptions): Promise<boolean> {
    return await showModal<boolean>(
        (resolve) => new ConfirmModal(options, resolve),
    );
}

// export class DestinationFolderConfirmationModal extends Modal {
//     constructor(app: App, onSubmit: (result: boolean) => void) {
//         super(app);
//         this.setTitle("Move destination folder?");

//         new Setting(this.contentEl).addButton((btn) =>
//             btn.setButtonText("Yes").onClick(() => {
//                 this.close();
//                 onSubmit(true);
//             }),
//         );
//         new Setting(this.contentEl).addButton((btn) =>
//             btn.setButtonText("No").onClick(() => {
//                 this.close();
//                 onSubmit(false);
//             }),
//         );
//     }
// }
