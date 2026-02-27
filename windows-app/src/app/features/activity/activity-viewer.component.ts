import { Component, inject, signal, computed, type OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { CourseService } from '../../core/services/course.service';
import { ForumService, type ForumDiscussion, type ForumPost, type Forum } from '../../core/services/forum.service';
import { AssignmentService, type Assignment, type SubmissionStatus, type SubmissionFile } from '../../core/services/assignment.service';
import { FileUploadService } from '../../core/services/file-upload.service';
import { MoodleApiService } from '../../core/services/moodle-api.service';
import { FileDownloadService } from '../../core/services/file-download.service';
import type { CourseModule } from '../../core/models/course.model';

/**
 * Generic activity viewer — dispatches based on `modname` parameter.
 * Supports: forum, assign, page, url, resource, folder, book, label.
 */
@Component({
    selector: 'app-activity-viewer',
    standalone: true,
    imports: [RouterLink, DatePipe, DecimalPipe, NgTemplateOutlet, FormsModule],
    templateUrl: './activity-viewer.component.html',
    styleUrl: './activity-viewer.component.scss',
})
export class ActivityViewerComponent implements OnInit {

    private readonly route = inject(ActivatedRoute);
    private readonly courseService = inject(CourseService);
    private readonly forumService = inject(ForumService);
    private readonly assignService = inject(AssignmentService);
    private readonly fileUpload = inject(FileUploadService);
    private readonly api = inject(MoodleApiService);
    private readonly fileDownload = inject(FileDownloadService);

    // Route params
    readonly courseId = signal(0);
    readonly modname = signal('');
    readonly moduleId = signal(0);     // Course-module ID
    readonly instanceId = signal(0);   // Activity instance ID

    // Common state
    readonly loading = signal(true);
    readonly error = signal('');
    readonly moduleName = signal('');

    // Module reference
    readonly currentModule = signal<CourseModule | null>(null);

    // --- Forum state ---
    readonly forum = signal<Forum | null>(null);
    readonly discussions = signal<ForumDiscussion[]>([]);
    readonly selectedDiscussion = signal<number | null>(null);
    readonly posts = signal<ForumPost[]>([]);
    readonly postsLoading = signal(false);
    readonly replyText = signal('');
    readonly replyingTo = signal<number | null>(null);
    readonly newDiscSubject = signal('');
    readonly newDiscMessage = signal('');
    readonly showNewDiscussion = signal(false);

    // --- Assignment state ---
    readonly assignment = signal<Assignment | null>(null);
    readonly submissionStatus = signal<SubmissionStatus | null>(null);
    readonly submissionText = signal('');
    readonly submitBusy = signal(false);
    readonly showSubmissionEditor = signal(false);
    readonly submissionFiles = signal<SubmissionFile[]>([]);
    readonly pendingFiles = signal<File[]>([]);
    readonly uploadProgress = signal('');
    readonly submitSuccess = signal('');
    readonly submitError = signal('');

    // Computed assignment helpers
    readonly hasOnlineText = computed(() => {
        const a = this.assignment();
        return a ? this.assignService.isPluginEnabled(a, 'onlinetext') : false;
    });

    readonly hasFileSubmission = computed(() => {
        const a = this.assignment();
        return a ? this.assignService.isPluginEnabled(a, 'file') : false;
    });

    readonly maxFiles = computed(() => {
        const a = this.assignment();
        return a ? this.assignService.getMaxFiles(a) : 1;
    });

    readonly submissionStatusKey = computed(() =>
        this.submissionStatus()?.lastattempt?.submission?.status ?? 'new',
    );

    readonly isOverdue = computed(() => {
        const a = this.assignment();
        if (!a?.duedate) return false;
        const now = Math.floor(Date.now() / 1000);
        return now > a.duedate && this.submissionStatusKey() !== 'submitted';
    });

    readonly timeRemaining = computed(() => {
        const a = this.assignment();
        if (!a?.duedate) return '';
        const now = Math.floor(Date.now() / 1000);
        const diff = a.duedate - now;
        if (diff <= 0) return 'Abgelaufen';
        const days = Math.floor(diff / 86400);
        const hours = Math.floor((diff % 86400) / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        if (days > 0) return `${days} Tag${days > 1 ? 'e' : ''}, ${hours} Std.`;
        if (hours > 0) return `${hours} Std., ${minutes} Min.`;
        return `${minutes} Min.`;
    });

    /** Raw numeric grade from the feedback. */
    readonly gradeRaw = computed<number | null>(() => {
        const feedback = this.submissionStatus()?.feedback?.grade;
        if (!feedback?.grade) return null;
        const raw = parseFloat(feedback.grade);
        return isNaN(raw) ? null : raw;
    });

    /** Calculates the grade percentage (0–100) from feedback grade and assignment max grade. */
    readonly gradePercentage = computed<number | null>(() => {
        const raw = this.gradeRaw();
        const max = this.assignment()?.grade;
        if (raw == null || !max || max <= 0) return null;

        return Math.min(100, Math.max(0, (raw / max) * 100));
    });

    // --- Page/Resource state ---
    readonly pageContent = signal('');
    readonly resourceUrl = signal('');

    // --- Folder state ---
    readonly folderFiles = signal<{ filename: string; fileurl: string; filesize: number }[]>([]);

    async ngOnInit(): Promise<void> {
        const params = this.route.snapshot.paramMap;
        this.courseId.set(Number(params.get('courseId')));
        this.modname.set(params.get('modname') ?? '');
        this.moduleId.set(Number(params.get('moduleId')));

        // Find the module in the course contents
        try {
            const sections = await this.courseService.getCourseContents(this.courseId());
            let foundModule: CourseModule | undefined;

            for (const section of sections) {
                foundModule = section.modules.find((m) => m.id === this.moduleId());
                if (foundModule) break;
            }

            if (foundModule) {
                this.currentModule.set(foundModule);
                this.moduleName.set(foundModule.name);
                this.instanceId.set(foundModule.instance);
            }

            await this.loadModuleContent();
        } catch (err) {
            console.error('Activity load failed:', err);
            this.error.set('Aktivität konnte nicht geladen werden.');
        } finally {
            this.loading.set(false);
        }
    }

    private async loadModuleContent(): Promise<void> {
        const mod = this.modname();

        switch (mod) {
            case 'forum':
                await this.loadForum();
                break;
            case 'assign':
                await this.loadAssignment();
                break;
            case 'page':
                await this.loadPage();
                break;
            case 'url':
                this.loadUrl();
                break;
            case 'resource':
                this.loadResource();
                break;
            case 'folder':
                this.loadFolder();
                break;
            case 'book':
                await this.loadPage(); // Books render similar to pages
                break;
            default:
                // Generic: show description and files
                break;
        }
    }

    // ========== Forum ==========

    private async loadForum(): Promise<void> {
        try {
            const forums = await this.forumService.getForum(this.courseId());
            const f = forums.find((fo) => fo.id === this.instanceId());
            if (f) {
                this.forum.set(f);
                const discussions = await this.forumService.getDiscussions(f.id, 0, 25, true);
                this.discussions.set(discussions);
            }
        } catch (err) {
            console.error('Failed to load forum:', err);
            this.error.set('Forum konnte nicht geladen werden.');
        }
    }

    async openDiscussion(discussionId: number): Promise<void> {
        this.selectedDiscussion.set(discussionId);
        this.postsLoading.set(true);
        try {
            const posts = await this.forumService.getDiscussionPosts(discussionId, true);
            this.posts.set(posts);
        } catch (err) {
            console.error('Failed to load posts:', err);
        } finally {
            this.postsLoading.set(false);
        }
    }

    backToDiscussions(): void {
        this.selectedDiscussion.set(null);
        this.posts.set([]);
        this.replyingTo.set(null);
    }

    startReply(postId: number): void {
        this.replyingTo.set(postId);
        this.replyText.set('');
    }

    cancelReply(): void {
        this.replyingTo.set(null);
        this.replyText.set('');
    }

    async sendReply(postId: number): Promise<void> {
        const text = this.replyText().trim();
        if (!text) return;

        try {
            await this.forumService.addReply(postId, 'Re: Antwort', text);
            // Reload posts – skip cache to ensure fresh data after mutation
            const discId = this.selectedDiscussion();
            if (discId) {
                const posts = await this.forumService.getDiscussionPosts(discId, true);
                this.posts.set(posts);
            }
            this.replyingTo.set(null);
            this.replyText.set('');
        } catch (err) {
            console.error('Reply failed:', err);
        }
    }

    toggleNewDiscussion(): void {
        this.showNewDiscussion.update((v) => !v);
        this.newDiscSubject.set('');
        this.newDiscMessage.set('');
    }

    async createDiscussion(): Promise<void> {
        const subject = this.newDiscSubject().trim();
        const message = this.newDiscMessage().trim();
        if (!subject || !message || !this.forum()) return;

        try {
            await this.forumService.addDiscussion(this.forum()!.id, subject, message);
            // Reload discussions – skip cache to ensure the new discussion appears
            const discussions = await this.forumService.getDiscussions(this.forum()!.id, 0, 25, true);
            this.discussions.set(discussions);
            this.showNewDiscussion.set(false);
        } catch (err) {
            console.error('Create discussion failed:', err);
        }
    }

    // ========== Assignment ==========

    private async loadAssignment(): Promise<void> {
        const assign = await this.assignService.getAssignmentByCmid(this.moduleId(), this.courseId());
        if (assign) {
            this.assignment.set(assign);
            await this.reloadSubmissionStatus(assign.id);
        }
    }

    private async reloadSubmissionStatus(assignId: number): Promise<void> {
        const status = await this.assignService.getSubmissionStatus(assignId);
        this.submissionStatus.set(status);

        // Pre-fill submission text if available
        const plugins = status.lastattempt?.submission?.plugins ?? [];
        const onlineText = plugins.find((p) => p.type === 'onlinetext');
        if (onlineText?.editorfields?.[0]) {
            this.submissionText.set(onlineText.editorfields[0].text);
        }

        // Collect existing file submissions
        const filePlugin = plugins.find((p) => p.type === 'file');
        const files = filePlugin?.fileareas?.flatMap((fa) => fa.files) ?? [];
        this.submissionFiles.set(files);
    }

    toggleSubmissionEditor(): void {
        this.showSubmissionEditor.update((v) => !v);
        this.submitSuccess.set('');
        this.submitError.set('');
    }

    onFilesSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (!input.files) return;

        const current = this.pendingFiles();
        const newFiles = Array.from(input.files);
        const max = this.maxFiles();
        const existing = this.submissionFiles().length;
        const allowed = max - existing - current.length;

        if (allowed <= 0) {
            this.submitError.set(`Maximal ${max} Datei${max > 1 ? 'en' : ''} erlaubt.`);
            return;
        }

        this.pendingFiles.set([...current, ...newFiles.slice(0, allowed)]);
        input.value = '';
    }

    removePendingFile(index: number): void {
        this.pendingFiles.update((files) => files.filter((_, i) => i !== index));
    }

    async saveSubmission(): Promise<void> {
        const assign = this.assignment();
        if (!assign) return;

        this.submitBusy.set(true);
        this.submitError.set('');
        this.submitSuccess.set('');

        try {
            let draftItemId = 0;

            // Upload pending files if any
            if (this.pendingFiles().length > 0) {
                this.uploadProgress.set('Dateien werden hochgeladen...');
                draftItemId = await this.fileUpload.uploadFiles(this.pendingFiles());
                this.uploadProgress.set('');
            }

            // Save submission
            if (this.hasOnlineText() || draftItemId) {
                await this.assignService.saveFullSubmission(
                    assign.id,
                    this.hasOnlineText() ? this.submissionText() : '',
                    draftItemId,
                );
            }

            // Reload
            await this.reloadSubmissionStatus(assign.id);
            this.pendingFiles.set([]);
            this.submitSuccess.set('Entwurf gespeichert.');
        } catch (err) {
            console.error('Save submission failed:', err);
            this.submitError.set('Speichern fehlgeschlagen. Bitte erneut versuchen.');
        } finally {
            this.submitBusy.set(false);
            this.uploadProgress.set('');
        }
    }

    async submitAssignment(): Promise<void> {
        const assign = this.assignment();
        if (!assign) return;

        this.submitBusy.set(true);
        this.submitError.set('');
        this.submitSuccess.set('');

        try {
            // Save first if there's pending content
            if (this.pendingFiles().length > 0 || this.hasOnlineText()) {
                await this.saveSubmission();
            }

            await this.assignService.submitForGrading(assign.id);
            await this.reloadSubmissionStatus(assign.id);
            this.showSubmissionEditor.set(false);
            this.submitSuccess.set('Erfolgreich zur Bewertung abgegeben!');
        } catch (err) {
            console.error('Submit failed:', err);
            this.submitError.set('Abgabe fehlgeschlagen. Bitte erneut versuchen.');
        } finally {
            this.submitBusy.set(false);
        }
    }

    getSubmissionStatusText(): string {
        const s = this.submissionStatusKey();
        const map: Record<string, string> = {
            new: 'Nicht abgegeben',
            draft: 'Entwurf',
            submitted: 'Abgegeben',
            reopened: 'Wiedereröffnet',
        };
        return map[s] ?? s ?? '-';
    }

    getSubmissionStatusColor(): string {
        const s = this.submissionStatusKey();
        if (this.isOverdue()) return 'var(--status-overdue)';
        const colors: Record<string, string> = {
            new: 'var(--status-new)',
            draft: 'var(--status-draft)',
            submitted: 'var(--status-submitted)',
            reopened: 'var(--status-draft)',
        };
        return colors[s] ?? 'var(--fg-3)';
    }

    getSubmissionStatusIcon(): string {
        const s = this.submissionStatusKey();
        if (this.isOverdue()) return '⚠️';
        const icons: Record<string, string> = {
            new: '📋',
            draft: '✏️',
            submitted: '✅',
            reopened: '🔄',
        };
        return icons[s] ?? '📋';
    }

    getGradingStatusText(): string {
        const g = this.submissionStatus()?.lastattempt?.gradingstatus;
        const map: Record<string, string> = {
            notgraded: 'Nicht bewertet',
            graded: 'Bewertet',
        };
        return map[g ?? ''] ?? g ?? '-';
    }

    canSubmit(): boolean {
        const a = this.assignment();
        if (!a || a.nosubmissions) return false;
        const status = this.submissionStatusKey();
        return status !== 'submitted';
    }

    canEdit(): boolean {
        const status = this.submissionStatusKey();
        return status === 'new' || status === 'draft' || status === 'reopened';
    }

    // ========== Page / Book ==========

    private async loadPage(): Promise<void> {
        const mod = this.currentModule();
        if (!mod) return;

        // Pages have content in module.contents or we fetch via WS
        try {
            const pages = await this.api.call<{ pages: RawPage[] }>(
                'mod_page_get_pages_by_courses',
                { courseids: [this.courseId()] },
            );
            const page = pages.pages?.find((p) => p.coursemodule === this.moduleId());
            if (page) {
                this.pageContent.set(page.content ?? '');
            }
        } catch {
            // Fallback: show description
            this.pageContent.set(mod.description ?? '');
        }
    }

    // ========== URL ==========

    private loadUrl(): void {
        const mod = this.currentModule();
        if (!mod) return;

        const urlContent = mod.contents?.find((c) => c.type === 'url');
        if (urlContent) {
            this.resourceUrl.set(urlContent.fileurl);
        } else if (mod.url) {
            this.resourceUrl.set(mod.url);
        }
    }

    openExternalUrl(): void {
        const url = this.resourceUrl();
        if (url) {
            window.open(url, '_blank');
        }
    }

    // ========== Resource ==========

    private loadResource(): void {
        const mod = this.currentModule();
        if (!mod?.contents?.length) return;

        const file = mod.contents[0];
        this.resourceUrl.set(this.api.getFileUrl(file.fileurl));
    }

    async downloadResource(): Promise<void> {
        const mod = this.currentModule();
        if (!mod?.contents?.length) return;

        const file = mod.contents[0];
        await this.fileDownload.downloadFile(file.fileurl, file.filename);
    }

    // ========== Folder ==========

    private loadFolder(): void {
        const mod = this.currentModule();
        if (!mod?.contents) return;

        this.folderFiles.set(
            mod.contents.map((c) => ({
                filename: c.filename,
                fileurl: this.api.getFileUrl(c.fileurl),
                filesize: c.filesize ?? 0,
            })),
        );
    }

    async downloadFolderFile(fileUrl: string, filename: string): Promise<void> {
        await this.fileDownload.downloadFile(fileUrl, filename);
    }

    formatTimestamp(ts: number): Date | null {
        return ts ? new Date(ts * 1000) : null;
    }

    formatFileSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    }
}

type RawPage = {
    id: number;
    coursemodule: number;
    course: number;
    name: string;
    content: string;
    contentformat: number;
};
