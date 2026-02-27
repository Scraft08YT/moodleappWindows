import { Component, inject, signal, computed, type OnInit, type OnDestroy, ViewChild, type ElementRef } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

import { CourseService } from '../../core/services/course.service';
import { ForumService, type ForumDiscussion, type ForumPost, type Forum } from '../../core/services/forum.service';
import { AssignmentService, type Assignment, type SubmissionStatus, type SubmissionFile } from '../../core/services/assignment.service';
import { QuizService, type Quiz, type QuizAttempt, type AttemptPageData, type AttemptQuestion, type AttemptSummaryQuestion, type AttemptReview, type QuizAccessInfo, type UserBestGrade } from '../../core/services/quiz.service';
import { FileUploadService } from '../../core/services/file-upload.service';
import { MoodleApiService } from '../../core/services/moodle-api.service';
import { FileDownloadService } from '../../core/services/file-download.service';
import type { CourseModule } from '../../core/models/course.model';

/** Comment returned by `core_comment_get_comments`. */
export type SubmissionComment = {
    id: number;
    content: string;
    fullname: string;
    time: string;
    timecreated: number;
    profileurl: string;
    avatar: string;
    userid: number;
    delete?: boolean;
};

/**
 * Generic activity viewer — dispatches based on `modname` parameter.
 * Supports: forum, assign, quiz, page, url, resource, folder, book, label.
 */
@Component({
    selector: 'app-activity-viewer',
    standalone: true,
    imports: [RouterLink, DatePipe, DecimalPipe, NgTemplateOutlet, FormsModule],
    templateUrl: './activity-viewer.component.html',
    styleUrl: './activity-viewer.component.scss',
})
export class ActivityViewerComponent implements OnInit, OnDestroy {

    private readonly route = inject(ActivatedRoute);
    private readonly courseService = inject(CourseService);
    private readonly forumService = inject(ForumService);
    private readonly assignService = inject(AssignmentService);
    readonly quizService = inject(QuizService);
    private readonly fileUpload = inject(FileUploadService);
    private readonly api = inject(MoodleApiService);
    private readonly fileDownload = inject(FileDownloadService);
    private readonly sanitizer = inject(DomSanitizer);

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
    readonly editingPostId = signal<number | null>(null);
    readonly editSubject = signal('');
    readonly editMessage = signal('');
    readonly editBusy = signal(false);
    readonly deleteBusy = signal<number | null>(null);
    readonly forumError = signal('');

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

    // --- Assignment comments state ---
    readonly assignComments = signal<SubmissionComment[]>([]);
    readonly assignCommentsLoading = signal(false);
    readonly showComments = signal(false);
    readonly newCommentText = signal('');
    readonly commentBusy = signal(false);

    // --- Quiz state ---
    readonly quiz = signal<Quiz | null>(null);
    readonly quizAccessInfo = signal<QuizAccessInfo | null>(null);
    readonly quizAttempts = signal<QuizAttempt[]>([]);
    readonly quizBestGrade = signal<UserBestGrade | null>(null);
    readonly quizView = signal<'info' | 'attempt' | 'summary' | 'review'>('info');
    readonly quizLoading = signal(false);
    readonly quizError = signal('');

    // Active attempt state
    readonly currentAttempt = signal<QuizAttempt | null>(null);
    readonly attemptPageData = signal<AttemptPageData | null>(null);
    readonly attemptPage = signal(0);
    readonly attemptSummary = signal<AttemptSummaryQuestion[]>([]);
    readonly attemptReview = signal<AttemptReview | null>(null);
    readonly quizBusy = signal(false);
    /** Sanitised HTML for current page questions. */
    readonly questionsHtml = signal<SafeHtml | null>(null);

    /** Timer interval handle for quiz time limit. */
    private quizTimerInterval: ReturnType<typeof setInterval> | null = null;
    readonly quizTimeLeft = signal(0);

    /** Formatted remaining time for display. */
    readonly quizTimeLeftFormatted = computed(() =>
        this.quizService.formatTimeLimit(this.quizTimeLeft()),
    );

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
                // Rewrite pluginfile URLs in module description for embedded media
                if (foundModule.description) {
                    foundModule.description = this.api.rewritePluginfileUrls(foundModule.description);
                }
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
            case 'quiz':
                await this.loadQuiz();
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
        this.forumError.set('');
        try {
            const posts = await this.forumService.getDiscussionPosts(discussionId, true);
            this.posts.set(posts);
        } catch (err) {
            console.error('Failed to load posts:', err);
            this.forumError.set('Beiträge konnten nicht geladen werden.');
        } finally {
            this.postsLoading.set(false);
        }
    }

    /** Reloads the current discussion's posts from the server. */
    private async reloadPosts(): Promise<void> {
        const discId = this.selectedDiscussion();
        if (!discId) return;
        const posts = await this.forumService.getDiscussionPosts(discId, true);
        this.posts.set(posts);
    }

    backToDiscussions(): void {
        this.selectedDiscussion.set(null);
        this.posts.set([]);
        this.replyingTo.set(null);
        this.editingPostId.set(null);
        this.forumError.set('');
    }

    startReply(postId: number): void {
        this.replyingTo.set(postId);
        this.replyText.set('');
        this.editingPostId.set(null);
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
            await this.reloadPosts();
            this.replyingTo.set(null);
            this.replyText.set('');
        } catch (err) {
            console.error('Reply failed:', err);
            this.forumError.set('Antwort konnte nicht gesendet werden.');
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
            const discussions = await this.forumService.getDiscussions(this.forum()!.id, 0, 25, true);
            this.discussions.set(discussions);
            this.showNewDiscussion.set(false);
        } catch (err) {
            console.error('Create discussion failed:', err);
            this.forumError.set('Thema konnte nicht erstellt werden.');
        }
    }

    // --- Editing ---

    startEditPost(post: ForumPost): void {
        this.editingPostId.set(post.id);
        this.editSubject.set(post.subject);
        this.editMessage.set(post.message.replace(/<[^>]*>/g, '')); // Strip HTML for plain textarea
        this.replyingTo.set(null);
    }

    cancelEdit(): void {
        this.editingPostId.set(null);
        this.editSubject.set('');
        this.editMessage.set('');
    }

    async saveEdit(postId: number): Promise<void> {
        const subject = this.editSubject().trim();
        const message = this.editMessage().trim();
        if (!subject || !message) return;

        this.editBusy.set(true);
        try {
            await this.forumService.updatePost(postId, subject, message);
            await this.reloadPosts();
            this.editingPostId.set(null);
            this.editSubject.set('');
            this.editMessage.set('');
        } catch (err) {
            console.error('Edit post failed:', err);
            this.forumError.set('Beitrag konnte nicht bearbeitet werden.');
        } finally {
            this.editBusy.set(false);
        }
    }

    // --- Deleting ---

    async deletePost(postId: number): Promise<void> {
        this.deleteBusy.set(postId);
        try {
            await this.forumService.deletePost(postId);
            await this.reloadPosts();
        } catch (err) {
            console.error('Delete post failed:', err);
            this.forumError.set('Beitrag konnte nicht gelöscht werden.');
        } finally {
            this.deleteBusy.set(null);
        }
    }

    // ========== Assignment ==========

    private async loadAssignment(): Promise<void> {
        const assign = await this.assignService.getAssignmentByCmid(this.moduleId(), this.courseId());
        if (assign) {
            // Rewrite pluginfile URLs in assignment description
            assign.intro = this.api.rewritePluginfileUrls(assign.intro ?? '');
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
                this.pageContent.set(this.api.rewritePluginfileUrls(page.content ?? ''));
            }
        } catch {
            // Fallback: show description
            this.pageContent.set(this.api.rewritePluginfileUrls(mod.description ?? ''));
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

    ngOnDestroy(): void {
        this.stopQuizTimer();
    }

    // ========== Assignment Comments ==========

    async toggleComments(): Promise<void> {
        const show = !this.showComments();
        this.showComments.set(show);
        if (show && this.assignComments().length === 0) {
            await this.loadAssignComments();
        }
    }

    private async loadAssignComments(): Promise<void> {
        const sub = this.submissionStatus()?.lastattempt?.submission;
        if (!sub) return;

        this.assignCommentsLoading.set(true);
        try {
            const res = await this.api.call<{ comments: SubmissionComment[]; canpost?: boolean }>(
                'core_comment_get_comments',
                {
                    contextlevel: 'module',
                    instanceid: this.moduleId(),
                    component: 'assignsubmission_comments',
                    itemid: sub.id,
                    area: 'submission_comments',
                },
            );
            this.assignComments.set(res.comments ?? []);
        } catch (err) {
            console.error('Failed to load comments:', err);
        } finally {
            this.assignCommentsLoading.set(false);
        }
    }

    async addComment(): Promise<void> {
        const text = this.newCommentText().trim();
        const sub = this.submissionStatus()?.lastattempt?.submission;
        if (!text || !sub) return;

        this.commentBusy.set(true);
        try {
            await this.api.call(
                'core_comment_add_comments',
                {
                    comments: [{
                        contextlevel: 'module',
                        instanceid: this.moduleId(),
                        component: 'assignsubmission_comments',
                        content: text,
                        itemid: sub.id,
                        area: 'submission_comments',
                    }],
                },
                { skipCache: true },
            );
            this.newCommentText.set('');
            await this.loadAssignComments();
        } catch (err) {
            console.error('Failed to add comment:', err);
            this.submitError.set('Kommentar konnte nicht gesendet werden.');
        } finally {
            this.commentBusy.set(false);
        }
    }

    // ========== Quiz ==========

    private async loadQuiz(): Promise<void> {
        try {
            const quiz = await this.quizService.getQuizByCmid(this.moduleId(), this.courseId());
            if (!quiz) {
                this.quizError.set('Quiz nicht gefunden.');
                return;
            }

            // Rewrite pluginfile URLs in quiz intro
            if (quiz.intro) {
                quiz.intro = this.api.rewritePluginfileUrls(quiz.intro);
            }
            this.quiz.set(quiz);

            // Load access info, attempts, and best grade independently
            // so a single failure doesn't block everything.
            const [accessResult, attemptsResult, bestGradeResult] = await Promise.allSettled([
                this.quizService.getAccessInformation(quiz.id),
                this.quizService.getUserAttempts(quiz.id),
                this.quizService.getUserBestGrade(quiz.id),
            ]);

            if (accessResult.status === 'fulfilled') {
                this.quizAccessInfo.set(accessResult.value);
            } else {
                console.warn('Quiz access info failed:', accessResult.reason);
            }
            if (attemptsResult.status === 'fulfilled') {
                this.quizAttempts.set(attemptsResult.value);
            } else {
                console.warn('Quiz attempts failed:', attemptsResult.reason);
            }
            if (bestGradeResult.status === 'fulfilled') {
                this.quizBestGrade.set(bestGradeResult.value);
            } else {
                console.warn('Quiz best grade failed:', bestGradeResult.reason);
            }
        } catch (err) {
            console.error('Failed to load quiz:', err);
            this.quizError.set('Quiz konnte nicht geladen werden.');
        }
    }

    /** Starts a new attempt or continues an in-progress one. */
    async startOrContinueAttempt(): Promise<void> {
        const quiz = this.quiz();
        if (!quiz) return;

        this.quizBusy.set(true);
        this.quizError.set('');
        try {
            // Check for an existing in-progress attempt
            const attempts = await this.quizService.getUserAttempts(quiz.id, 'unfinished');
            let attempt: QuizAttempt;

            if (attempts.length > 0) {
                attempt = attempts[0];
            } else {
                attempt = await this.quizService.startAttempt(quiz.id);
            }

            this.currentAttempt.set(attempt);
            this.attemptPage.set(attempt.currentpage ?? 0);
            await this.loadAttemptPage(attempt.id, attempt.currentpage ?? 0);
            this.quizView.set('attempt');
            this.startQuizTimer();
        } catch (err) {
            console.error('Start attempt failed:', err);
            this.quizError.set('Versuch konnte nicht gestartet werden.');
        } finally {
            this.quizBusy.set(false);
        }
    }

    /** Loads question data for a page of the current attempt. */
    private async loadAttemptPage(attemptId: number, page: number): Promise<void> {
        this.quizLoading.set(true);
        try {
            const data = await this.quizService.getAttemptData(attemptId, page);
            this.attemptPageData.set(data);
            this.attemptPage.set(page);

            // Build combined question HTML
            const combined = data.questions.map((q) => q.html).join('');
            this.questionsHtml.set(this.sanitizer.bypassSecurityTrustHtml(
                this.api.rewritePluginfileUrls(combined),
            ));
        } catch (err) {
            console.error('Load attempt page failed:', err);
            this.quizError.set('Seite konnte nicht geladen werden.');
        } finally {
            this.quizLoading.set(false);
        }
    }

    /** Saves current answers and navigates to a different page. */
    async navigateQuizPage(targetPage: number): Promise<void> {
        const attempt = this.currentAttempt();
        if (!attempt) return;

        this.quizBusy.set(true);
        this.quizError.set('');
        try {
            // Collect answers from the rendered questions
            const container = document.querySelector('.quiz-questions') as HTMLElement | null;
            if (container) {
                const answers = this.quizService.collectAnswersFromContainer(container);
                if (Object.keys(answers).length > 0) {
                    await this.quizService.saveAttempt(attempt.id, answers);
                }
            }

            await this.loadAttemptPage(attempt.id, targetPage);
        } catch (err) {
            console.error('Navigate quiz page failed:', err);
            this.quizError.set('Seite konnte nicht gewechselt werden.');
        } finally {
            this.quizBusy.set(false);
        }
    }

    /** Opens the attempt summary before final submission. */
    async showAttemptSummary(): Promise<void> {
        const attempt = this.currentAttempt();
        if (!attempt) return;

        this.quizBusy.set(true);
        this.quizError.set('');
        try {
            // Save current page answers first
            const container = document.querySelector('.quiz-questions') as HTMLElement | null;
            if (container) {
                const answers = this.quizService.collectAnswersFromContainer(container);
                if (Object.keys(answers).length > 0) {
                    await this.quizService.saveAttempt(attempt.id, answers);
                }
            }

            const summary = await this.quizService.getAttemptSummary(attempt.id);
            this.attemptSummary.set(summary);
            this.quizView.set('summary');
        } catch (err) {
            console.error('Show summary failed:', err);
            this.quizError.set('Zusammenfassung konnte nicht geladen werden.');
        } finally {
            this.quizBusy.set(false);
        }
    }

    /** Submits the attempt for grading (finishes it). */
    async submitQuizAttempt(): Promise<void> {
        const attempt = this.currentAttempt();
        if (!attempt) return;

        this.quizBusy.set(true);
        this.quizError.set('');
        try {
            await this.quizService.processAttempt(attempt.id, {}, true);
            this.stopQuizTimer();

            // Load review
            const review = await this.quizService.getAttemptReview(attempt.id);
            this.attemptReview.set(review);
            this.quizView.set('review');

            // Refresh attempt list
            const quiz = this.quiz();
            if (quiz) {
                const [attempts, bestGrade] = await Promise.all([
                    this.quizService.getUserAttempts(quiz.id),
                    this.quizService.getUserBestGrade(quiz.id),
                ]);
                this.quizAttempts.set(attempts);
                this.quizBestGrade.set(bestGrade);
            }
        } catch (err) {
            console.error('Submit attempt failed:', err);
            this.quizError.set('Versuch konnte nicht abgegeben werden.');
        } finally {
            this.quizBusy.set(false);
        }
    }

    /** Opens the review of a finished attempt. */
    async openAttemptReview(attemptId: number): Promise<void> {
        this.quizLoading.set(true);
        this.quizError.set('');
        try {
            const review = await this.quizService.getAttemptReview(attemptId);
            this.attemptReview.set(review);
            this.quizView.set('review');
        } catch (err) {
            console.error('Load review failed:', err);
            this.quizError.set('Überprüfung konnte nicht geladen werden.');
        } finally {
            this.quizLoading.set(false);
        }
    }

    /** Returns to the quiz info page. */
    backToQuizInfo(): void {
        this.quizView.set('info');
        this.currentAttempt.set(null);
        this.attemptPageData.set(null);
        this.attemptReview.set(null);
        this.attemptSummary.set([]);
        this.questionsHtml.set(null);
        this.quizError.set('');
        this.stopQuizTimer();
    }

    /** Returns from summary to the attempt (continue answering). */
    async backToAttempt(): Promise<void> {
        const attempt = this.currentAttempt();
        if (!attempt) return;

        this.quizView.set('attempt');
        await this.loadAttemptPage(attempt.id, this.attemptPage());
    }

    // ── Quiz timer ──────────────────────────────────────

    private startQuizTimer(): void {
        this.stopQuizTimer();

        const quiz = this.quiz();
        const attempt = this.currentAttempt();
        if (!quiz?.timelimit || !attempt?.timestart) return;

        const endTime = attempt.timestart + quiz.timelimit;
        const updateTimer = (): void => {
            const now = Math.floor(Date.now() / 1000);
            const remaining = Math.max(0, endTime - now);
            this.quizTimeLeft.set(remaining);

            if (remaining <= 0) {
                this.stopQuizTimer();
                // Auto-submit when time runs out
                this.submitQuizAttempt();
            }
        };

        updateTimer();
        this.quizTimerInterval = setInterval(updateTimer, 1000);
    }

    private stopQuizTimer(): void {
        if (this.quizTimerInterval) {
            clearInterval(this.quizTimerInterval);
            this.quizTimerInterval = null;
        }
    }

    // ── Quiz helpers ────────────────────────────────────

    getQuizGradeDisplay(): string {
        const quiz = this.quiz();
        const best = this.quizBestGrade();
        if (!best?.hasgrade || best.grade === undefined || !quiz?.grade) return 'Noch nicht bewertet';
        const pct = (best.grade / quiz.grade) * 100;
        return `${best.grade.toFixed(quiz.decimalpoints ?? 2)} / ${quiz.grade} (${pct.toFixed(1)}%)`;
    }

    getAttemptGradeDisplay(attempt: QuizAttempt): string {
        const quiz = this.quiz();
        if (attempt.sumgrades == null || !quiz?.sumgrades || !quiz.grade) return '-';
        const rescaled = (attempt.sumgrades / quiz.sumgrades) * quiz.grade;
        return rescaled.toFixed(quiz.decimalpoints ?? 2);
    }

    canStartNewAttempt(): boolean {
        const quiz = this.quiz();
        const access = this.quizAccessInfo();
        if (!quiz || !access?.canattempt) return false;
        if (access.preventaccessreasons?.length) return false;
        if (quiz.attempts > 0 && this.quizAttempts().filter((a) => a.state === 'finished').length >= quiz.attempts) {
            return false;
        }
        return true;
    }

    hasInProgressAttempt(): boolean {
        return this.quizAttempts().some((a) => a.state === 'inprogress');
    }

    /** Total number of pages based on layout string. */
    getQuizPageCount(): number {
        const attempt = this.currentAttempt();
        if (!attempt?.layout) return 1;
        // Layout is comma-separated slot numbers with 0 as page delimiter
        return attempt.layout.split(',').filter((s) => s.trim() === '0').length + 1;
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
