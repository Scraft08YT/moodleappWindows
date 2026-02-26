import { Component, inject, signal, computed, type OnInit } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { AuthService } from '../../core/services/auth.service';
import { GradeService } from '../../core/services/grade.service';
import { CourseService } from '../../core/services/course.service';
import type { GradeItem, CourseGrade } from '../../core/models/grade.model';

/**
 * Grades overview page — shows all course grades,
 * with expandable per-course grade tables.
 */
@Component({
    selector: 'app-grades',
    standalone: true,
    imports: [DecimalPipe],
    templateUrl: './grades.component.html',
    styleUrl: './grades.component.scss',
})
export class GradesComponent implements OnInit {

    private readonly auth = inject(AuthService);
    private readonly gradeService = inject(GradeService);
    private readonly courseService = inject(CourseService);

    readonly loading = this.gradeService.loading;
    readonly courseGrades = this.gradeService.courseGrades;
    readonly expandedCourse = signal<number | null>(null);
    readonly courseItems = signal<GradeItem[]>([]);
    readonly courseItemsLoading = signal(false);

    readonly userId = computed(() => this.auth.session()?.siteInfo.userid ?? 0);

    async ngOnInit(): Promise<void> {
        const uid = this.userId();
        if (!uid) return;

        // Load courses too if not already loaded
        if (this.courseService.courses().length === 0) {
            await this.courseService.loadCourses(uid);
        }

        await this.gradeService.loadOverviewGrades(uid);

        // Cross-reference course names from CourseService when API didn't return them
        this.enrichCourseNames();
    }

    /**
     * Fills in missing courseFullname / courseShortname from the loaded courses list.
     * The Moodle API often omits these fields.
     */
    private enrichCourseNames(): void {
        const courses = this.courseService.courses();
        if (!courses.length) return;

        const courseMap = new Map(courses.map((c) => [c.id, c]));
        const enriched = this.courseGrades().map((g) => {
            if (g.courseFullname) return g;
            const course = courseMap.get(g.courseid);
            if (!course) return g;
            return {
                ...g,
                courseFullname: course.fullname,
                courseShortname: course.shortname,
            };
        });

        this.gradeService.courseGrades.set(enriched);
    }

    async toggleCourseGrades(courseId: number): Promise<void> {
        if (this.expandedCourse() === courseId) {
            this.expandedCourse.set(null);
            this.courseItems.set([]);
            return;
        }

        this.expandedCourse.set(courseId);
        this.courseItemsLoading.set(true);

        try {
            const items = await this.gradeService.getCourseGrades(courseId, this.userId());
            this.courseItems.set(items);
        } catch (err) {
            console.error('Failed to load course grades:', err);
            this.courseItems.set([]);
        } finally {
            this.courseItemsLoading.set(false);
        }
    }

    getGradeColor(grade: CourseGrade): string {
        if (grade.rawgrade == null) return 'var(--fg-3)';
        const pct = grade.rawgrade;
        if (pct >= 80) return '#43A047';
        if (pct >= 60) return '#FB8C00';
        if (pct >= 40) return '#F4511E';
        return '#E53935';
    }

    getItemIndent(item: GradeItem): string {
        return `${item.depth * 16}px`;
    }

    isCategory(item: GradeItem): boolean {
        return item.itemtype === 'category';
    }

    isCourseTotal(item: GradeItem): boolean {
        return item.itemtype === 'course';
    }
}
