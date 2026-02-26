import { Injectable, inject } from '@angular/core';

import { StorageService } from './storage.service';

const DOWNLOADS_KEY = 'downloaded_files';

export type DownloadRecord = {
    /** Unique key: fileUrl used for the download. */
    fileUrl: string;
    /** Local file path on disk. */
    filePath: string;
    /** Original filename. */
    filename: string;
    /** Associated course module ID (optional). */
    moduleId?: number;
    /** Associated course ID (optional). */
    courseId?: number;
    /** Timestamp of download completion. */
    downloadedAt: number;
    /** File size in bytes (if known). */
    fileSize?: number;
};

/**
 * Tracks downloaded files and enables re-opening them without re-downloading.
 *
 * Uses Tauri's shell plugin to open files natively.
 */
@Injectable({ providedIn: 'root' })
export class DownloadedFilesService {

    private readonly storage = inject(StorageService);

    /** In-memory cache of download records (loaded once). */
    private records: DownloadRecord[] = [];
    private loaded = false;

    /** Loads records from storage into memory. */
    private async ensureLoaded(): Promise<void> {
        if (this.loaded) return;
        this.records = (await this.storage.get<DownloadRecord[]>(DOWNLOADS_KEY)) ?? [];
        this.loaded = true;
    }

    /** Records a successful download. */
    async recordDownload(record: DownloadRecord): Promise<void> {
        await this.ensureLoaded();

        // Update existing or add new
        const idx = this.records.findIndex((r) => r.fileUrl === record.fileUrl);
        if (idx >= 0) {
            this.records[idx] = record;
        } else {
            this.records.push(record);
        }

        await this.storage.set(DOWNLOADS_KEY, this.records);
    }

    /** Checks if a file has been downloaded before by its fileUrl. */
    async isDownloaded(fileUrl: string): Promise<boolean> {
        await this.ensureLoaded();
        const record = this.records.find((r) => r.fileUrl === fileUrl);
        if (!record) return false;

        // Verify the file still exists on disk
        return this.fileExists(record.filePath);
    }

    /** Gets the download record for a file URL. */
    async getRecord(fileUrl: string): Promise<DownloadRecord | null> {
        await this.ensureLoaded();
        return this.records.find((r) => r.fileUrl === fileUrl) ?? null;
    }

    /** Gets all download records for a specific course. */
    async getRecordsForCourse(courseId: number): Promise<DownloadRecord[]> {
        await this.ensureLoaded();
        return this.records.filter((r) => r.courseId === courseId);
    }

    /** Opens a previously downloaded file using the system default application. */
    async openFile(fileUrl: string): Promise<boolean> {
        const record = await this.getRecord(fileUrl);
        if (!record) return false;

        // Only allow opening files in the Downloads directory
        if (!this.isInDownloadsDir(record.filePath)) return false;

        try {
            const { open } = await import('@tauri-apps/plugin-shell' as string);
            await open(record.filePath);
            return true;
        } catch {
            // Browser fallback or file no longer exists
            return false;
        }
    }

    /** Opens the folder containing a downloaded file. */
    async showInFolder(fileUrl: string): Promise<boolean> {
        const record = await this.getRecord(fileUrl);
        if (!record) return false;

        // Only allow opening folders in the Downloads directory
        if (!this.isInDownloadsDir(record.filePath)) return false;

        try {
            const { open } = await import('@tauri-apps/plugin-shell' as string);
            const sep = record.filePath.includes('\\') ? '\\' : '/';
            const folder = record.filePath.substring(0, record.filePath.lastIndexOf(sep));
            await open(folder);
            return true;
        } catch {
            return false;
        }
    }

    /** Removes a download record (does not delete the file). */
    async removeRecord(fileUrl: string): Promise<void> {
        await this.ensureLoaded();
        this.records = this.records.filter((r) => r.fileUrl !== fileUrl);
        await this.storage.set(DOWNLOADS_KEY, this.records);
    }

    /** Checks if a file exists at the given path via Tauri FS. */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            const { exists } = await import('@tauri-apps/plugin-fs' as string);
            return await exists(filePath) as boolean;
        } catch {
            return false;
        }
    }

    /**
     * Validates that a file path is inside the user's Downloads directory.
     * Prevents path traversal attacks via manipulated storage records.
     */
    private isInDownloadsDir(filePath: string): boolean {
        const normalised = filePath.replace(/\\/g, '/').toLowerCase();

        // Reject path traversal sequences
        if (normalised.includes('..')) return false;

        // Must be in a Downloads-like directory
        return normalised.includes('/downloads/') || normalised.includes('/download/');
    }
}
