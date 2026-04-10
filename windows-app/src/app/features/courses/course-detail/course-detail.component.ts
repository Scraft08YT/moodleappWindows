import { Component, inject, signal, type OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CourseService } from '../../../core/services/course.service';
import { FileDownloadService, type DownloadProgress } from '../../../core/services/file-download.service';
import { DownloadedFilesService } from '../../../core/services/downloaded-files.service';
import { MoodleApiService } from '../../../core/services/moodle-api.service';
import type { CourseSection, CourseModule } from '../../../core/models/course.model';
import { SafeHtmlPipe } from '../../../shared/pipes/safe-html.pipe';

/**
 * Course detail page – shows sections and modules of a single course.
 */
@Component({
    selector: 'app-course-detail',
    standalone: true,
    imports: [RouterLink, SafeHtmlPipe],
    templateUrl: './course-detail.component.html',
    styleUrl: './course-detail.component.scss',
})
export class CourseDetailComponent implements OnInit {

    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly courseService = inject(CourseService);
    private readonly fileDownload = inject(FileDownloadService);
    private readonly downloadedFiles = inject(DownloadedFilesService);
    private readonly api = inject(MoodleApiService);

    readonly sections = signal<CourseSection[]>([]);
    readonly loading = signal(true);
    readonly courseName = signal('');
    readonly expandedSections = signal<Set<number>>(new Set());
    /** Set of fileUrls that have been downloaded (for showing "Open" button). */
    readonly downloadedFileUrls = signal<Set<string>>(new Set());
    /** Expose active downloads for progress UI. */
    readonly activeDownloads = this.fileDownload.activeDownloads;

    async ngOnInit(): Promise<void> {
        const courseId = Number(this.route.snapshot.paramMap.get('id'));
        if (!courseId) return;

        // Find course name from loaded courses
        const course = this.courseService.courses().find((c) => c.id === courseId);
        this.courseName.set(course?.fullname ?? `Kurs ${courseId}`);

        try {
            const sections = await this.courseService.getCourseContents(courseId);
            this.sections.set(sections);

            // Auto-expand all sections
            const ids = new Set(sections.map((s) => s.id));
            this.expandedSections.set(ids);

            // Check which files have been downloaded before
            await this.refreshDownloadedStatus(sections);
        } finally {
            this.loading.set(false);
        }
    }

    toggleSection(sectionId: number): void {
        this.expandedSections.update((set) => {
            const next = new Set(set);
            if (next.has(sectionId)) {
                next.delete(sectionId);
            } else {
                next.add(sectionId);
            }
            return next;
        });
    }

    isSectionExpanded(sectionId: number): boolean {
        return this.expandedSections().has(sectionId);
    }

    getModuleIcon(modname: string): string {
        const icons: Record<string, string> = {
            assign: '📝',
            quiz: '❓',
            forum: '💬',
            resource: '📄',
            url: '🔗',
            page: '📃',
            folder: '📁',
            label: '🏷️',
            book: '📖',
            choice: '✅',
            feedback: '📋',
            glossary: '📚',
            workshop: '🔧',
            wiki: '📰',
            lesson: '🎓',
            data: '🗃️',
            chat: '💭',
            survey: '📊',
            scorm: '🎮',
            lti: '🔌',
            h5pactivity: '🎯',
            bigbluebuttonbn: '🎥',
        };
        return icons[modname] ?? '📦';
    }

    async downloadFile(fileUrl: string, filename: string): Promise<void> {
        const courseId = Number(this.route.snapshot.paramMap.get('id'));
        await this.fileDownload.downloadFile(fileUrl, filename, { courseId });

        // Mark as downloaded in UI
        this.downloadedFileUrls.update((set) => {
            const next = new Set(set);
            next.add(fileUrl);
            return next;
        });
    }

    /** Opens a previously downloaded file using the system default app. */
    async openDownloadedFile(fileUrl: string): Promise<void> {
        await this.downloadedFiles.openFile(fileUrl);
    }

    /** Gets the download progress for a file URL, or null if not downloading. */
    getDownloadProgress(fileUrl: string): DownloadProgress | null {
        return this.activeDownloads().find((d) => d.fileUrl === fileUrl) ?? null;
    }

    /** Whether a file has been downloaded before. */
    isFileDownloaded(fileUrl: string): boolean {
        return this.downloadedFileUrls().has(fileUrl);
    }

    /** Scans all module contents and checks download status. */
    private async refreshDownloadedStatus(sections: CourseSection[]): Promise<void> {
        const downloaded = new Set<string>();
        const checks: Promise<void>[] = [];

        for (const section of sections) {
            for (const mod of section.modules) {
                for (const content of mod.contents) {
                    checks.push(
                        this.downloadedFiles.isDownloaded(content.fileurl).then((yes) => {
                            if (yes) downloaded.add(content.fileurl);
                        }),
                    );
                }
            }
        }

        await Promise.all(checks);
        this.downloadedFileUrls.set(downloaded);
    }

    /** Navigate to the activity viewer for the given module. */
    openModule(module: CourseModule): void {
        const courseId = Number(this.route.snapshot.paramMap.get('id'));
        void this.router.navigate(['/activity', courseId, module.modname, module.id]);
    }

    /** Whether clicking a module should navigate to the activity viewer. */
    isInteractiveModule(modname: string): boolean {
        return ['forum', 'assign', 'page', 'url', 'resource', 'folder', 'book',
            'quiz', 'glossary', 'wiki', 'lesson', 'choice', 'feedback',
            'data', 'workshop', 'h5pactivity', 'lti', 'scorm'].includes(modname);
    }

    /** Returns total number of modules across all sections. */
    getTotalModules(): number {
        return this.sections().reduce((sum, s) => sum + s.modules.length, 0);
    }

    /** Returns a category type for colour coding. */
    getModuleType(modname: string): string {
        const types: Record<string, string> = {
            assign: 'activity', quiz: 'activity', choice: 'activity',
            feedback: 'activity', workshop: 'activity', lesson: 'activity',
            forum: 'collaboration', glossary: 'collaboration', wiki: 'collaboration',
            data: 'collaboration', chat: 'collaboration',
            resource: 'content', page: 'content', book: 'content',
            url: 'content', folder: 'content', label: 'content',
            scorm: 'interactive', h5pactivity: 'interactive', lti: 'interactive',
            bigbluebuttonbn: 'interactive', survey: 'interactive',
        };
        return types[modname] ?? 'content';
    }

    /** Extracts and uppercases the file extension from a filename. */
    getFileExtension(filename: string): string {
        const ext = filename.split('.').pop() ?? '';
        return ext.slice(0, 5).toUpperCase();
    }

    /** Returns a human-readable German label for the module type. */
    getModuleLabel(modname: string): string {
        const labels: Record<string, string> = {
            assign: 'Aufgabe', quiz: 'Test', forum: 'Forum',
            resource: 'Datei', url: 'Link', page: 'Textseite',
            folder: 'Ordner', label: 'Beschriftung', book: 'Buch',
            choice: 'Abstimmung', feedback: 'Feedback', glossary: 'Glossar',
            workshop: 'Workshop', wiki: 'Wiki', lesson: 'Lektion',
            data: 'Datenbank', chat: 'Chat', survey: 'Umfrage',
            scorm: 'SCORM', lti: 'Extern', h5pactivity: 'H5P',
            bigbluebuttonbn: 'Konferenz',
        };
        return labels[modname] ?? modname;
    }
}
