import { Injectable, signal } from '@angular/core';

import { MoodleApiService } from './moodle-api.service';
import type { Course, CourseSection } from '../models/course.model';

/**
 * Service for fetching course data from Moodle.
 *
 * Uses `core_enrol_get_users_courses` and `core_course_get_contents`.
 */
@Injectable({ providedIn: 'root' })
export class CourseService {

    readonly courses = signal<Course[]>([]);
    readonly loading = signal(false);

    constructor(private readonly api: MoodleApiService) {}

    /** Loads all courses the current user is enrolled in. */
    async loadCourses(userId: number): Promise<void> {
        this.loading.set(true);
        try {
            const raw = await this.api.call<RawCourse[]>(
                'core_enrol_get_users_courses',
                { userid: userId },
            );

            const mapped: Course[] = raw.map((c) => ({
                id: c.id,
                shortname: c.shortname,
                fullname: c.fullname,
                displayname: c.displayname ?? c.fullname,
                summary: c.summary,
                summaryformat: c.summaryformat,
                category: c.category,
                progress: c.progress ?? null,
                completed: c.completed ?? false,
                startdate: c.startdate,
                enddate: c.enddate,
                visible: c.visible !== false,
                courseImage: c.courseimage ?? this.extractImageFromOverviewFiles(c.overviewfiles),
                isfavourite: c.isfavourite ?? false,
                enrolledusercount: c.enrolledusercount ?? 0,
                overviewfiles: (c.overviewfiles ?? []).map((f) => ({
                    ...f,
                    mimetype: f.mimetype ?? '',
                })),
            }));

            this.courses.set(mapped);
        } finally {
            this.loading.set(false);
        }
    }

    /** Fetches the sections and modules of a single course. */
    async getCourseContents(courseId: number): Promise<CourseSection[]> {
        const raw = await this.api.call<RawSection[]>(
            'core_course_get_contents',
            { courseid: courseId },
        );

        return raw.map((s) => ({
            id: s.id,
            name: s.name,
            summary: s.summary,
            visible: s.visible !== 0,
            modules: (s.modules ?? []).map((m) => ({
                id: m.id,
                name: m.name,
                instance: m.instance,
                modname: m.modname,
                modicon: m.modicon,
                description: m.description ?? '',
                url: m.url ?? '',
                visible: m.visible !== 0,
                contents: (m.contents ?? []).map((ct) => ({
                    type: ct.type,
                    filename: ct.filename,
                    filepath: ct.filepath,
                    filesize: ct.filesize,
                    fileurl: ct.fileurl,
                    timecreated: ct.timecreated,
                    timemodified: ct.timemodified,
                    mimetype: ct.mimetype ?? '',
                })),
            })),
        }));
    }

    /** Extracts a course image from overviewfiles if available. */
    private extractImageFromOverviewFiles(files?: RawOverviewFile[]): string {
        if (!files?.length) {
            return '';
        }
        const img = files.find((f) => f.mimetype?.startsWith('image/'));
        return img?.fileurl ?? '';
    }

    // ---- Course Search & Enrollment ----

    /**
     * Searches for courses available on the Moodle site.
     * Uses `core_course_search_courses`.
     */
    async searchCourses(query: string, page = 0, perPage = 20): Promise<CourseSearchResult> {
        const raw = await this.api.call<RawCourseSearchResult>(
            'core_course_search_courses',
            { criterianame: 'search', criteriavalue: query, page, perpage: perPage },
        );
        return {
            total: raw.total,
            courses: (raw.courses ?? []).map((c) => ({
                id: c.id,
                shortname: c.shortname,
                fullname: c.fullname,
                displayname: c.displayname ?? c.fullname,
                summary: c.summary ?? '',
                categoryname: c.categoryname ?? '',
                courseImage: c.courseimage ?? c.overviewfiles?.[0]?.fileurl ?? '',
                enrolledusercount: c.enrolledusercount ?? 0,
                contacts: (c.contacts ?? []).map((ct) => ct.fullname),
            })),
        };
    }

    /**
     * Gets the available enrolment methods for a course.
     * Uses `core_enrol_get_course_enrolment_methods`.
     */
    async getEnrolmentMethods(courseId: number): Promise<EnrolmentMethod[]> {
        const raw = await this.api.call<RawEnrolmentMethod[]>(
            'core_enrol_get_course_enrolment_methods',
            { courseid: courseId },
        );
        return raw
            .filter((m) => m.status === true || m.status === 'true' as unknown)
            .map((m) => ({
                id: m.id,
                courseid: m.courseid,
                type: m.type,
                name: m.name ?? m.type,
                status: true,
                wsfunction: m.wsfunction ?? '',
            }));
    }

    /**
     * Self-enrols the current user in a course.
     * Uses `enrol_self_enrol_user`.
     */
    async selfEnrol(courseId: number, password = '', instanceId?: number): Promise<SelfEnrolResult> {
        const params: Record<string, unknown> = { courseid: courseId, password };
        if (instanceId !== undefined) {
            params['instanceid'] = instanceId;
        }
        try {
            const raw = await this.api.call<RawSelfEnrolResponse>('enrol_self_enrol_user', params);
            if (raw.status === true || raw.status === 'true' as unknown) {
                return { success: true };
            }
            // Check for warnings (e.g. invalid password)
            const warning = (raw.warnings ?? []).find(
                (w) => w.warningcode === '2' || w.warningcode === '3' || w.warningcode === '4',
            );
            if (warning) {
                return { success: false, error: 'invalid_key', message: warning.message };
            }
            const firstWarning = raw.warnings?.[0];
            return { success: false, error: 'unknown', message: firstWarning?.message ?? 'Einschreibung fehlgeschlagen.' };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('enrol_self_enrol_user')) {
                return { success: false, error: 'not_supported', message: 'Selbsteinschreibung wird nicht unterstützt.' };
            }
            return { success: false, error: 'unknown', message };
        }
    }

    /**
     * Checks whether the current user is already enrolled in a course.
     */
    isEnrolled(courseId: number): boolean {
        return this.courses().some((c) => c.id === courseId);
    }

    // ---- Category Browsing ----

    /**
     * Fetches all course categories from the site.
     * Uses `core_course_get_categories`.
     */
    async getCategories(parentId?: number): Promise<CourseCategory[]> {
        const params: Record<string, unknown> = {};
        if (parentId !== undefined) {
            params['criteria'] = [{ key: 'parent', value: String(parentId) }];
        }
        const raw = await this.api.call<RawCategory[]>('core_course_get_categories', params);
        return raw.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description ?? '',
            parent: c.parent,
            coursecount: c.coursecount,
            depth: c.depth,
            path: c.path ?? '',
        }));
    }

    /**
     * Fetches courses belonging to a specific category.
     * Uses `core_course_get_courses_by_field`.
     */
    async getCoursesByCategory(categoryId: number): Promise<SearchableCourse[]> {
        const raw = await this.api.call<{ courses: RawSearchCourse[] }>(
            'core_course_get_courses_by_field',
            { field: 'category', value: String(categoryId) },
        );
        return (raw.courses ?? []).map((c) => ({
            id: c.id,
            shortname: c.shortname,
            fullname: c.fullname,
            displayname: c.displayname ?? c.fullname,
            summary: c.summary ?? '',
            categoryname: c.categoryname ?? '',
            courseImage: c.courseimage ?? c.overviewfiles?.[0]?.fileurl ?? '',
            enrolledusercount: c.enrolledusercount ?? 0,
            contacts: (c.contacts ?? []).map((ct) => ct.fullname),
        }));
    }
}

/** Result of a course search. */
export type CourseSearchResult = {
    total: number;
    courses: SearchableCourse[];
};

export type SearchableCourse = {
    id: number;
    shortname: string;
    fullname: string;
    displayname: string;
    summary: string;
    categoryname: string;
    courseImage: string;
    enrolledusercount: number;
    contacts: string[];
};

export type EnrolmentMethod = {
    id: number;
    courseid: number;
    type: string;
    name: string;
    status: boolean;
    wsfunction: string;
};

export type SelfEnrolResult = {
    success: boolean;
    error?: string;
    message?: string;
};

export type CourseCategory = {
    id: number;
    name: string;
    description: string;
    parent: number;
    coursecount: number;
    depth: number;
    path: string;
};

// Raw Moodle API response types
type RawCourse = {
    id: number;
    shortname: string;
    fullname: string;
    displayname?: string;
    summary: string;
    summaryformat: number;
    category: number;
    progress?: number;
    completed?: boolean;
    startdate: number;
    enddate: number;
    visible?: boolean;
    courseimage?: string;
    isfavourite?: boolean;
    enrolledusercount?: number;
    overviewfiles?: RawOverviewFile[];
};

type RawOverviewFile = {
    filename: string;
    filepath: string;
    filesize: number;
    fileurl: string;
    mimetype?: string;
};

type RawSection = {
    id: number;
    name: string;
    summary: string;
    visible: number;
    modules?: RawModule[];
};

type RawModule = {
    id: number;
    name: string;
    instance: number;
    modname: string;
    modicon: string;
    description?: string;
    url?: string;
    visible: number;
    contents?: RawContent[];
};

type RawContent = {
    type: string;
    filename: string;
    filepath: string;
    filesize: number;
    fileurl: string;
    timecreated: number;
    timemodified: number;
    mimetype?: string;
};

// --- Course Search & Enrolment raw types ---

type RawCourseSearchResult = {
    total: number;
    courses: RawSearchCourse[];
};

type RawSearchCourse = {
    id: number;
    shortname: string;
    fullname: string;
    displayname?: string;
    summary?: string;
    categoryname?: string;
    courseimage?: string;
    enrolledusercount?: number;
    overviewfiles?: { fileurl: string }[];
    contacts?: { fullname: string }[];
};

type RawEnrolmentMethod = {
    id: number;
    courseid: number;
    type: string;
    name?: string;
    status: boolean | string;
    wsfunction?: string;
};

type RawSelfEnrolResponse = {
    status: boolean | string;
    warnings?: { warningcode: string; message: string }[];
};

type RawCategory = {
    id: number;
    name: string;
    description?: string;
    parent: number;
    coursecount: number;
    depth: number;
    path?: string;
};
