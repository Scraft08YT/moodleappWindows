import { inject, Injectable, signal } from '@angular/core';

import { MoodleApiService } from './moodle-api.service';
import { DownloadedFilesService } from './downloaded-files.service';

/**
 * Service for downloading files from Moodle.
 *
 * Uses Tauri's file system plugin for saving files natively,
 * with a browser fallback for development.
 * Records successful downloads for later re-opening.
 */
@Injectable({ providedIn: 'root' })
export class FileDownloadService {

    private readonly api = inject(MoodleApiService);
    private readonly downloadedFiles = inject(DownloadedFilesService);

    readonly activeDownloads = signal<DownloadProgress[]>([]);

    /**
     * Downloads a file from Moodle and saves it to the user's Downloads folder.
     *
     * @param fileUrl    Raw file URL from Moodle
     * @param filename   Desired filename
     * @param metadata   Optional course/module info for tracking
     */
    async downloadFile(fileUrl: string, filename: string, metadata?: DownloadMetadata): Promise<void> {
        const url = this.api.getFileUrl(fileUrl);
        const downloadId = crypto.randomUUID();

        this.activeDownloads.update((list) => [
            ...list,
            { id: downloadId, fileUrl, filename, progress: 0, status: 'downloading' },
        ]);

        try {
            // Try Tauri native download first
            if (await this.tryTauriDownload(url, filename, downloadId, fileUrl, metadata)) {
                return;
            }

            // Browser fallback: trigger download via anchor element
            await this.browserDownload(url, filename, downloadId);
        } catch (error) {
            this.activeDownloads.update((list) =>
                list.map((d) =>
                    d.id === downloadId ? { ...d, status: 'error' as const } : d,
                ),
            );
            throw error;
        }
    }

    /** Attempts to download using Tauri's FS plugin. */
    private async tryTauriDownload(
        url: string, filename: string, downloadId: string,
        originalFileUrl: string, metadata?: DownloadMetadata,
    ): Promise<boolean> {
        try {
            const { download } = await import('@tauri-apps/plugin-upload' as string);
            const { downloadDir, join } = await import('@tauri-apps/api/path' as string);

            const downloadPath = await downloadDir();
            const filePath = await join(downloadPath, filename);

            await download(url, filePath, (progress: number, total: number) => {
                const pct = total > 0
                    ? Math.round((progress / total) * 100)
                    : 0;
                this.activeDownloads.update((list) =>
                    list.map((d) =>
                        d.id === downloadId ? { ...d, progress: pct } : d,
                    ),
                );
            });

            this.activeDownloads.update((list) =>
                list.map((d) =>
                    d.id === downloadId ? { ...d, progress: 100, status: 'complete' as const } : d,
                ),
            );

            this.scheduleRemove(downloadId);

            // Record the download for later re-opening
            void this.downloadedFiles.recordDownload({
                fileUrl: originalFileUrl,
                filePath,
                filename,
                moduleId: metadata?.moduleId,
                courseId: metadata?.courseId,
                downloadedAt: Date.now(),
            });

            return true;
        } catch {
            return false;
        }
    }

    /** Browser fallback download via hidden anchor. */
    private async browserDownload(url: string, filename: string, downloadId: string): Promise<void> {
        const response = await fetch(url);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.click();

        URL.revokeObjectURL(objectUrl);

        this.activeDownloads.update((list) =>
            list.map((d) =>
                d.id === downloadId ? { ...d, progress: 100, status: 'complete' as const } : d,
            ),
        );

        this.scheduleRemove(downloadId);
    }

    /** Removes a completed/errored download from the active list after a delay. */
    private scheduleRemove(downloadId: string): void {
        setTimeout(() => {
            this.activeDownloads.update((list) => list.filter((d) => d.id !== downloadId));
        }, 3_000);
    }
}

export type DownloadProgress = {
    id: string;
    fileUrl: string;
    filename: string;
    progress: number;
    status: 'downloading' | 'complete' | 'error';
};

export type DownloadMetadata = {
    moduleId?: number;
    courseId?: number;
};
