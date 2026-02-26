import { Injectable } from '@angular/core';

import { MoodleApiService } from './moodle-api.service';

/** Metadata returned after uploading a file. */
export type UploadedFile = {
    component: string;
    contextid: number;
    userid: number;
    filearea: string;
    filename: string;
    filepath: string;
    itemid: number;
    license: string;
    author: string;
    source: string;
    filesize: number;
    url: string;
};

/**
 * Service for uploading files to Moodle draft areas.
 *
 * Uses `core_files_upload` (Moodle 3.x+).
 * Files are uploaded to the user's draft area and then attached via
 * the relevant plugin's item-id when saving a submission or post.
 */
@Injectable({ providedIn: 'root' })
export class FileUploadService {

    constructor(private readonly api: MoodleApiService) {}

    /**
     * Uploads a file to the user's draft area using XMLHttpRequest
     * so we can send actual FormData (fetch doesn't give us upload progress).
     *
     * @param file The File object from an <input> or drag-and-drop.
     * @param itemId Optional existing draft item ID to append to.
     * @returns Uploaded file info including the item ID.
     */
    async uploadToDraftArea(file: File, itemId = 0): Promise<UploadedFile[]> {
        const session = this.api.getSession();
        if (!session) throw new Error('Not authenticated');

        const url = `${session.siteUrl}/webservice/upload.php`;

        const formData = new FormData();
        formData.append('token', session.token);
        formData.append('file_1', file, file.name);
        formData.append('itemid', String(itemId));
        formData.append('filearea', 'draft');

        const response = await fetch(url, {
            method: 'POST',
            body: formData,
        });

        const result = await response.json() as UploadedFile[] | { error: string; errorcode: string };

        if (!Array.isArray(result)) {
            throw new Error((result as { error: string }).error ?? 'Upload failed');
        }

        return result;
    }

    /**
     * Builds a Moodle-compatible draft item-id by uploading a set of files.
     *
     * @param files Array of File objects.
     * @returns The draft item ID that can be used when saving submissions.
     */
    async uploadFiles(files: File[]): Promise<number> {
        let itemId = 0;
        for (const file of files) {
            const result = await this.uploadToDraftArea(file, itemId);
            if (result.length > 0) {
                itemId = result[0].itemid;
            }
        }
        return itemId;
    }
}
