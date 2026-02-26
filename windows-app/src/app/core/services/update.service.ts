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
    /** Direct download URL for manual update fallback. */
    downloadUrl?: string;
};

/** GitHub Releases API response shape (subset). */
type GitHubRelease = {
    tag_name: string;
    name: string;
    body: string;
    published_at: string;
    html_url: string;
    assets: { name: string; browser_download_url: string }[];
};

const GITHUB_RELEASES_API = 'https://api.github.com/repos/Scraft08YT/moodleappWindows/releases/latest';

/**
 * Handles in-app updates via Tauri's updater plugin,
 * with a GitHub Releases API fallback when `latest.json` is unavailable.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {

    readonly status = signal<UpdateStatus>('idle');
    readonly updateInfo = signal<UpdateInfo | null>(null);
    readonly downloadProgress = signal(0);
    readonly errorMessage = signal('');
    readonly currentVersion = signal('1.0.0');
    /** Whether the update was found via the GitHub API fallback (manual download). */
    readonly isManualUpdate = signal(false);

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
        this.isManualUpdate.set(false);

        // 1. Try Tauri's built-in updater first (requires latest.json + signatures)
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
        } catch {
            // Tauri updater failed (no latest.json / missing signatures) — fall back to GitHub API
            console.warn('[UpdateService] Tauri updater failed, trying GitHub API fallback');
        }

        // 2. Fallback: query GitHub Releases API directly
        return this.checkViaGitHubApi();
    }

    /**
     * Fallback update check using the GitHub Releases API.
     * Compares the latest release tag against the current app version.
     */
    private async checkViaGitHubApi(): Promise<boolean> {
        try {
            const res = await fetch(GITHUB_RELEASES_API, {
                headers: { Accept: 'application/vnd.github.v3+json' },
            });

            if (!res.ok) {
                // No release exists yet or network error
                this.status.set('up-to-date');
                return false;
            }

            const release: GitHubRelease = await res.json();
            const remoteVersion = release.tag_name.replace(/^desktop-v/, '');
            const current = this.currentVersion();

            if (this.isNewerVersion(remoteVersion, current)) {
                // Find the .exe installer asset for download
                const exeAsset = release.assets.find((a) => a.name.endsWith('-setup.exe'));
                const downloadUrl = exeAsset?.browser_download_url ?? release.html_url;

                this.updateInfo.set({
                    version: remoteVersion,
                    date: release.published_at,
                    body: release.body ?? '',
                    downloadUrl,
                });
                this.isManualUpdate.set(true);
                this.status.set('available');
                return true;
            }

            this.status.set('up-to-date');
            return false;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.status.set('error');
            this.errorMessage.set(`Update-Prüfung fehlgeschlagen: ${msg}`);
            console.error('[UpdateService] GitHub API fallback failed:', msg);
            return false;
        }
    }

    /**
     * Compares two semver strings: returns true if `remote` is newer than `current`.
     */
    private isNewerVersion(remote: string, current: string): boolean {
        const parse = (v: string): number[] => v.split('.').map(Number);
        const r = parse(remote);
        const c = parse(current);

        for (let i = 0; i < Math.max(r.length, c.length); i++) {
            const rv = r[i] ?? 0;
            const cv = c[i] ?? 0;
            if (rv > cv) return true;
            if (rv < cv) return false;
        }
        return false;
    }

    /** Downloads and installs the pending update, then restarts the app. */
    async downloadAndInstall(): Promise<void> {
        // If this is a manual (GitHub API) update, open the download page instead
        if (this.isManualUpdate()) {
            const url = this.updateInfo()?.downloadUrl;
            if (url) {
                try {
                    const { open } = await import('@tauri-apps/plugin-shell' as string);
                    await open(url);
                } catch {
                    window.open(url, '_blank');
                }
            }
            return;
        }

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
