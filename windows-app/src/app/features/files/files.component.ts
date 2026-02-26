import { Component, inject, signal, type OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { FileDownloadService, type DownloadProgress } from '../../core/services/file-download.service';
import { MoodleApiService } from '../../core/services/moodle-api.service';
import { AuthService } from '../../core/services/auth.service';

type PrivateFile = {
    filename: string;
    filepath: string;
    filesize: number;
    fileurl: string;
    timemodified: number;
    mimetype: string;
};

/**
 * Files page – browse private files and manage downloads.
 */
@Component({
    selector: 'app-files',
    standalone: true,
    imports: [DecimalPipe],
    templateUrl: './files.component.html',
    styleUrl: './files.component.scss',
})
export class FilesComponent implements OnInit {

    private readonly downloadService = inject(FileDownloadService);
    private readonly api = inject(MoodleApiService);
    private readonly auth = inject(AuthService);

    readonly activeDownloads = this.downloadService.activeDownloads;
    readonly files = signal<PrivateFile[]>([]);
    readonly loading = signal(true);

    async ngOnInit(): Promise<void> {
        await this.loadFiles();
    }

    async loadFiles(): Promise<void> {
        this.loading.set(true);
        try {
            const userId = this.auth.session()?.siteInfo.userid;
            if (!userId) return;

            const result = await this.api.call<{ files: PrivateFile[] }>(
                'core_user_get_private_files_info',
                {},
            ).catch(() => ({ files: [] as PrivateFile[] }));

            // Try getting actual files via user private files area
            const userFiles = await this.api.call<{ files: PrivateFile[] }>(
                'core_files_get_files',
                {
                    contextid: -1,
                    component: 'user',
                    filearea: 'private',
                    itemid: 0,
                    filepath: '/',
                    filename: '',
                },
            ).catch(() => ({ files: [] as PrivateFile[] }));

            this.files.set(userFiles.files ?? result.files ?? []);
        } finally {
            this.loading.set(false);
        }
    }

    async downloadFile(file: PrivateFile): Promise<void> {
        await this.downloadService.downloadFile(file.fileurl, file.filename);
    }

    getFileIcon(file: PrivateFile): string {
        const ext = file.filename.split('.').pop()?.toLowerCase() ?? '';
        const icons: Record<string, string> = {
            pdf: '📄',
            doc: '📝', docx: '📝',
            xls: '📊', xlsx: '📊',
            ppt: '📽️', pptx: '📽️',
            jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️',
            mp4: '🎬', avi: '🎬', mov: '🎬', webm: '🎬',
            mp3: '🎵', wav: '🎵', ogg: '🎵',
            zip: '📦', rar: '📦', '7z': '📦',
            txt: '📃',
            html: '🌐',
            py: '🐍',
            js: '⚡', ts: '⚡',
        };

        return icons[ext] ?? '📎';
    }

    formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;

        return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    }

    formatDate(timestamp: number): string {
        return new Date(timestamp * 1000).toLocaleDateString('de-DE', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    }

    trackDownload(_index: number, download: DownloadProgress): string {
        return download.filename;
    }
}
