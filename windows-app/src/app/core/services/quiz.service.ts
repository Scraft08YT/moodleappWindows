import { Injectable } from '@angular/core';

import { MoodleApiService } from './moodle-api.service';

// ── Public types ────────────────────────────────────────

/** Quiz overview returned by `mod_quiz_get_quizzes_by_courses`. */
export type Quiz = {
    id: number;
    coursemodule: number;
    course: number;
    name: string;
    intro: string;
    introformat: number;
    timeopen: number;
    timeclose: number;
    timelimit: number;
    /** Maximum allowed attempts (0 = unlimited). */
    attempts: number;
    grademethod: number;
    grade: number;
    sumgrades: number | null;
    hasquestions: number;
    preferredbehaviour: string;
    decimalpoints: number;
    questionsperpage: number;
    navmethod: string;
    autosaveperiod: number;
};

/** Per-user attempt record. */
export type QuizAttempt = {
    id: number;
    quiz: number;
    userid: number;
    attempt: number;
    uniqueid: number;
    layout: string;
    currentpage: number;
    preview: number;
    state: AttemptState;
    timestart: number;
    timefinish: number;
    timemodified: number;
    sumgrades: number | null;
};

export type AttemptState = 'inprogress' | 'overdue' | 'finished' | 'abandoned';

/** A single question inside an attempt page. */
export type AttemptQuestion = {
    slot: number;
    type: string;
    page: number;
    flagged: boolean;
    number: number;
    html: string;
    sequencecheck: number;
    status: string;
    state: string;
    /** Whether the question has been answered. */
    hasautosavedstep?: boolean;
    /** Additional state class for styling. */
    stateclass?: string;
};

/** Data for a single page of an in-progress attempt. */
export type AttemptPageData = {
    attempt: QuizAttempt;
    nextpage: number;
    questions: AttemptQuestion[];
};

/** Summary of all questions in an attempt (navigation overview). */
export type AttemptSummaryQuestion = {
    slot: number;
    type: string;
    page: number;
    flagged: boolean;
    number: number;
    status: string;
    state: string;
    stateclass: string;
    html: string;
    sequencecheck: number;
};

/** Review data: finished attempt with grade and questions. */
export type AttemptReview = {
    grade: string;
    attempt: QuizAttempt;
    additionaldata: { id: string; title: string; content: string }[];
    questions: AttemptQuestion[];
};

/** Access information for a quiz. */
export type QuizAccessInfo = {
    canattempt: boolean;
    canmanage: boolean;
    canpreview: boolean;
    canreviewmyattempts: boolean;
    preventaccessreasons: string[];
};

/** Best grade for a quiz. */
export type UserBestGrade = {
    hasgrade: boolean;
    grade?: number;
    gradetopass?: number;
};

// ── Raw WS response types ────────────────────────────────

type RawQuizzesResponse = { quizzes: Quiz[]; warnings?: unknown[] };
type RawUserAttemptsResponse = { attempts: QuizAttempt[]; warnings?: unknown[] };
type RawStartAttemptResponse = { attempt: QuizAttempt; warnings?: unknown[] };
type RawAttemptDataResponse = {
    attempt: QuizAttempt;
    messages: string[];
    nextpage: number;
    questions: AttemptQuestion[];
    warnings?: unknown[];
};
type RawAttemptSummaryResponse = {
    questions: AttemptSummaryQuestion[];
    warnings?: unknown[];
};
type RawAttemptReviewResponse = {
    grade: string;
    attempt: QuizAttempt;
    additionaldata: { id: string; title: string; content: string }[];
    questions: AttemptQuestion[];
    warnings?: unknown[];
};
type RawAccessInfoResponse = QuizAccessInfo & { warnings?: unknown[] };
type RawUserBestGradeResponse = UserBestGrade & { warnings?: unknown[] };
type RawProcessAttemptResponse = { state: string; warnings?: unknown[] };

/**
 * Service for Moodle quiz interactions.
 *
 * Wraps the `mod_quiz_*` WS functions used for listing quizzes,
 * managing attempts, fetching questions, and submitting answers.
 */
@Injectable({ providedIn: 'root' })
export class QuizService {

    constructor(private readonly api: MoodleApiService) {}

    // ── Quiz metadata ───────────────────────────────────

    /** Fetches all quizzes for the given course IDs. */
    async getQuizzesByCourses(courseIds: number[]): Promise<Quiz[]> {
        const res = await this.api.call<RawQuizzesResponse>(
            'mod_quiz_get_quizzes_by_courses',
            { courseids: courseIds },
        );
        return res.quizzes ?? [];
    }

    /** Finds a single quiz by its course-module ID. */
    async getQuizByCmid(cmid: number, courseId: number): Promise<Quiz | undefined> {
        const quizzes = await this.getQuizzesByCourses([courseId]);
        return quizzes.find((q) => q.coursemodule === cmid);
    }

    /** Fetches access information for a quiz. */
    async getAccessInformation(quizId: number): Promise<QuizAccessInfo> {
        return this.api.call<RawAccessInfoResponse>(
            'mod_quiz_get_quiz_access_information',
            { quizid: quizId },
        );
    }

    /** Fetches the user's best grade for a quiz. */
    async getUserBestGrade(quizId: number): Promise<UserBestGrade> {
        return this.api.call<RawUserBestGradeResponse>(
            'mod_quiz_get_user_best_grade',
            { quizid: quizId },
        );
    }

    // ── Attempts ────────────────────────────────────────

    /**
     * Fetches all attempts for the current user on a quiz.
     *
     * Uses `mod_quiz_get_user_attempts` which is available since Moodle 3.1.
     * The newer `mod_quiz_get_user_quiz_attempts` (Moodle 5.0+) is tried first
     * only as a future-proof measure.
     */
    async getUserAttempts(
        quizId: number,
        status: 'all' | 'finished' | 'unfinished' = 'all',
    ): Promise<QuizAttempt[]> {
        // Use legacy endpoint first — available on Moodle 3.1+.
        // The newer mod_quiz_get_user_quiz_attempts is only on Moodle 5.0+.
        try {
            const res = await this.api.call<RawUserAttemptsResponse>(
                'mod_quiz_get_user_attempts',
                { quizid: quizId, status, includepreviews: 0 },
            );
            return res.attempts ?? [];
        } catch {
            // Moodle 5.0+ fallback
            const res = await this.api.call<RawUserAttemptsResponse>(
                'mod_quiz_get_user_quiz_attempts',
                { quizid: quizId, status, includepreviews: 0 },
            );
            return res.attempts ?? [];
        }
    }

    /** Starts a new attempt on the quiz. */
    async startAttempt(quizId: number, forceNew = false): Promise<QuizAttempt> {
        const res = await this.api.call<RawStartAttemptResponse>(
            'mod_quiz_start_attempt',
            { quizid: quizId, forcenew: forceNew ? 1 : 0 },
            { skipCache: true },
        );
        return res.attempt;
    }

    // ── Attempt data (questions per page) ───────────────

    /** Fetches question data for a specific page of an attempt. */
    async getAttemptData(attemptId: number, page: number): Promise<AttemptPageData> {
        const res = await this.api.call<RawAttemptDataResponse>(
            'mod_quiz_get_attempt_data',
            { attemptid: attemptId, page },
            { skipCache: true },
        );
        return {
            attempt: res.attempt,
            nextpage: res.nextpage,
            questions: res.questions,
        };
    }

    /** Fetches a summary of all questions in an attempt. */
    async getAttemptSummary(attemptId: number): Promise<AttemptSummaryQuestion[]> {
        const res = await this.api.call<RawAttemptSummaryResponse>(
            'mod_quiz_get_attempt_summary',
            { attemptid: attemptId },
            { skipCache: true },
        );
        return res.questions ?? [];
    }

    // ── Saving & submitting ─────────────────────────────

    /**
     * Saves the current answers without finishing.
     *
     * @param attemptId  The attempt ID.
     * @param data       Key-value pairs of form field names and values.
     */
    async saveAttempt(attemptId: number, data: Record<string, string>): Promise<void> {
        const dataArray = Object.entries(data).map(([name, value]) => ({ name, value }));
        await this.api.call(
            'mod_quiz_save_attempt',
            { attemptid: attemptId, data: dataArray },
            { skipCache: true },
        );
    }

    /**
     * Processes (optionally finishes) an attempt.
     *
     * @param attemptId     The attempt ID.
     * @param data          Key-value pairs of form field names and values.
     * @param finishAttempt Whether to mark the attempt as finished.
     * @returns The new attempt state.
     */
    async processAttempt(
        attemptId: number,
        data: Record<string, string>,
        finishAttempt = false,
    ): Promise<string> {
        const dataArray = Object.entries(data).map(([name, value]) => ({ name, value }));
        const res = await this.api.call<RawProcessAttemptResponse>(
            'mod_quiz_process_attempt',
            {
                attemptid: attemptId,
                data: dataArray,
                finishattempt: finishAttempt ? 1 : 0,
                timeup: 0,
            },
            { skipCache: true },
        );
        return res.state;
    }

    // ── Review ──────────────────────────────────────────

    /** Fetches the review data for a finished attempt. */
    async getAttemptReview(attemptId: number, page?: number): Promise<AttemptReview> {
        const params: Record<string, unknown> = { attemptid: attemptId };
        if (page !== undefined) {
            params['page'] = page;
        }
        return this.api.call<RawAttemptReviewResponse>(
            'mod_quiz_get_attempt_review',
            params,
        );
    }

    // ── Helpers ─────────────────────────────────────────

    /** Collects all form field name/value pairs from rendered question HTML inside a container. */
    collectAnswersFromContainer(container: HTMLElement): Record<string, string> {
        const answers: Record<string, string> = {};
        const inputs = container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
            'input, textarea, select',
        );
        for (const el of inputs) {
            const name = el.getAttribute('name');
            if (!name) continue;

            if (el instanceof HTMLInputElement) {
                if (el.type === 'radio' || el.type === 'checkbox') {
                    if (el.checked) {
                        answers[name] = el.value;
                    }
                } else {
                    answers[name] = el.value;
                }
            } else {
                answers[name] = el.value;
            }
        }
        return answers;
    }

    /** Formats seconds into MM:SS or HH:MM:SS. */
    formatTimeLimit(seconds: number): string {
        if (seconds <= 0) return '';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) {
            return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    /** Maps attempt state to a human-readable German label. */
    getAttemptStateLabel(state: AttemptState): string {
        const map: Record<AttemptState, string> = {
            inprogress: 'In Bearbeitung',
            overdue: 'Überfällig',
            finished: 'Abgeschlossen',
            abandoned: 'Abgebrochen',
        };
        return map[state] ?? state;
    }

    /** Maps grademethod int to label. */
    getGradeMethodLabel(method: number): string {
        const map: Record<number, string> = {
            1: 'Bester Versuch',
            2: 'Durchschnitt',
            3: 'Erster Versuch',
            4: 'Letzter Versuch',
        };
        return map[method] ?? `Methode ${method}`;
    }
}
