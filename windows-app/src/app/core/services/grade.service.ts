import { Injectable, signal } from '@angular/core';

import { MoodleApiService } from './moodle-api.service';
import type { GradeItem, CourseGrade } from '../models/grade.model';

/**
 * Service for fetching grade data from Moodle.
 *
 * Uses `gradereport_user_get_grades_table` for per-course grades
 * and `gradereport_overview_get_course_grades` for an overview.
 */
@Injectable({ providedIn: 'root' })
export class GradeService {

    readonly courseGrades = signal<CourseGrade[]>([]);
    readonly loading = signal(false);

    constructor(private readonly api: MoodleApiService) {}

    /** Loads course grade overview for the user. */
    async loadOverviewGrades(userId: number): Promise<void> {
        this.loading.set(true);
        try {
            const raw = await this.api.call<{ grades: RawCourseGrade[] }>(
                'gradereport_overview_get_course_grades',
                { userid: userId },
            );

            this.courseGrades.set(
                (raw.grades ?? []).map((g) => ({
                    courseid: g.courseid,
                    grade: g.grade ?? '-',
                    rawgrade: g.rawgrade != null ? Number(g.rawgrade) : null,
                    courseFullname: g.coursefullname ?? '',
                    courseShortname: g.courseshortname ?? '',
                })),
            );
        } catch (err) {
            console.error('[GradeService] Failed to load overview grades:', err);
        } finally {
            this.loading.set(false);
        }
    }

    /** Loads the grade table for a specific course. */
    async getCourseGrades(courseId: number, userId: number): Promise<GradeItem[]> {
        const raw = await this.api.call<{ tables: RawGradeTable[] }>(
            'gradereport_user_get_grades_table',
            { courseid: courseId, userid: userId },
        );

        const table = raw.tables?.[0];
        if (!table?.tabledata) return [];

        return this.parseGradeTable(table.tabledata);
    }

    /** Parses the complex Moodle grade table format into flat items. */
    private parseGradeTable(tabledata: RawTableRow[]): GradeItem[] {
        const items: GradeItem[] = [];
        let currentCategory = '';
        let idCounter = 0;

        for (const row of tabledata) {
            // Skip empty/separator rows
            if (!row || typeof row !== 'object') continue;

            const itemname = this.extractCellText(row['itemname']);
            const grade = this.extractCellText(row['grade']);
            const percentage = this.extractCellText(row['percentage']);
            const feedback = this.extractCellText(row['feedback']);
            const lettergrade = this.extractCellText(row['lettergrade']);
            const weight = this.extractCellText(row['weight']);
            const range = this.extractCellText(row['range']);
            const leader = row['leader'] as { class?: string } | undefined;

            if (!itemname && !grade) continue;

            // Determine item type from CSS classes
            const itemClass = (row['itemname'] as { class?: string })?.class ?? '';
            let itemtype: 'category' | 'item' | 'course' = 'item';
            let depth = 0;

            if (itemClass.includes('course')) {
                itemtype = 'course';
            } else if (itemClass.includes('category')) {
                itemtype = 'category';
                currentCategory = itemname;
            }

            // Parse depth from leader
            if (leader?.class) {
                const depthMatch = leader.class.match(/level(\d+)/);
                if (depthMatch) {
                    depth = parseInt(depthMatch[1], 10);
                }
            }

            // Parse range for min/max
            let grademin = 0;
            let grademax = 100;
            if (range?.includes('&ndash;') || range?.includes('–')) {
                const parts = range.replace('&ndash;', '–').split('–');
                if (parts.length === 2) {
                    grademin = parseFloat(parts[0]) || 0;
                    grademax = parseFloat(parts[1]) || 100;
                }
            }

            items.push({
                id: ++idCounter,
                itemname: itemname || 'Kursnote',
                category: currentCategory,
                gradeformatted: grade || '-',
                graderaw: this.parseNumber(grade),
                grademax,
                grademin,
                percentageformatted: percentage || '-',
                feedback: feedback || '',
                weight: this.parseNumber(weight),
                lettergrade: lettergrade || '',
                itemtype,
                depth,
            });
        }

        return items;
    }

    /** Extracts text content from a Moodle grade table cell. */
    private extractCellText(cell: unknown): string {
        if (!cell || typeof cell !== 'object') return '';
        const content = (cell as { content?: string }).content ?? '';
        // Strip HTML tags for plain text
        return content.replace(/<[^>]*>/g, '').trim();
    }

    /** Parses a formatted number string, returns null if not numeric. */
    private parseNumber(value: string | null | undefined): number | null {
        if (!value) return null;
        const cleaned = value.replace(/[^\d.,\-]/g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    }
}

// Raw Moodle API response types
type RawCourseGrade = {
    courseid: number;
    grade?: string;
    rawgrade?: number;
    coursefullname?: string;
    courseshortname?: string;
};

type RawGradeTable = {
    courseid: number;
    userid: number;
    userfullname: string;
    maxdepth: number;
    tabledata: RawTableRow[];
};

type RawTableRow = Record<string, unknown>;
