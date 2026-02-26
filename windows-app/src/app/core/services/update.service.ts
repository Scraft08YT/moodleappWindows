import { Injectable, signal } from '@angular/core';

export type UpdateStatus =
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'ready'
    | 'up-to-date'
    | 'error';

export type UpdateInfo = {
    version: string;
    date: string;
    body: string;
};

/**
 * Handles in-app updates via Tauri's updater plugin.
 *
 * Falls back gracefully in browser dev mode.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {

    readonly status = signal<UpdateStatus>('idle');
    readonly updateInfo = signal<UpdateInfo | null>(null);
    readonly downloadProgress = signal(0);
    readonly errorMessage = signal('');
    readonly currentVersion = signal('1.0.0');

    private pendingUpdate: TauriUpdate | null = null;

    /** Loads the current app version from Tauri. */
    async loadVersion(): Promise<void> {
        try {
            const { getVersion } = await import('@tauri-apps/api/app' as string);
            this.currentVersion.set(await getVersion());
        } catch {
            // Browser fallback
        }
    }

    /** Checks GitHub releases for a newer version. */
    async checkForUpdate(): Promise<boolean> {
        this.status.set('checking');
        this.errorMessage.set('');

        try {
            const { check } = await import('@tauri-apps/plugin-updater' as string);
            const update = await check() as TauriUpdate | null;

            if (update) {
                this.pendingUpdate = update;
                this.updateInfo.set({
                    version: update.version,
                    date: update.date ?? '',
                    body: update.body ?? '',
                });
                this.status.set('available');
                return true;
            }

            this.status.set('up-to-date');
            return false;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);

            // Network/404 errors mean no release exists yet
            if (msg.includes('404') || msg.includes('network') || msg.includes('fetch') || msg.includes('status')) {
                this.status.set('up-to-date');
                this.errorMessage.set('');
                return false;
            }

            // Empty pubkey during development — not a real error
            if (msg.includes('pubkey') || msg.includes('signature') || msg.includes('key')) {
                this.status.set('up-to-date');
                this.errorMessage.set('');
                return false;
            }

            this.status.set('error');
            this.errorMessage.set('Update-Prüfung fehlgeschlagen: ' + msg);
            return false;
        }
    }

    /** Downloads and installs the pending update, then restarts the app. */
    async downloadAndInstall(): Promise<void> {
        if (!this.pendingUpdate) return;

        this.status.set('downloading');
        this.downloadProgress.set(0);

        try {
            let contentLength = 0;
            let downloaded = 0;

            await this.pendingUpdate.downloadAndInstall((event: UpdateEvent) => {
                if (event.event === 'Started') {
                    contentLength = event.data?.contentLength ?? 0;
                } else if (event.event === 'Progress') {
                    downloaded += event.data?.chunkLength ?? 0;
                    const pct = contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : 0;
                    this.downloadProgress.set(pct);
                } else if (event.event === 'Finished') {
                    this.downloadProgress.set(100);
                }
            });

            this.status.set('ready');

            // Restart the app after a short delay
            const { relaunch } = await import('@tauri-apps/plugin-process' as string);
            await relaunch();
        } catch (err) {
            this.status.set('error');
            this.errorMessage.set(err instanceof Error ? err.message : 'Download fehlgeschlagen');
        }
    }
}

/** Minimal type for the Tauri updater response. */
type TauriUpdate = {
    version: string;
    date?: string;
    body?: string;
    downloadAndInstall(onEvent: (event: UpdateEvent) => void): Promise<void>;
};

type UpdateEvent = {
    event: 'Started' | 'Progress' | 'Finished';
    data?: {
        contentLength?: number;
        chunkLength?: number;
    };
};
