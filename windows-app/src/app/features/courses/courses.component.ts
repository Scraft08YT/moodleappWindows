import { Component, inject, signal, computed, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../core/services/auth.service';
import { CourseService } from '../../core/services/course.service';
import type { Course } from '../../core/models/course.model';

/**
 * Courses overview page – shows all enrolled courses as a grid
 * with search, filter, and favourite options.
 */
@Component({
    selector: 'app-courses',
    standalone: true,
    imports: [RouterLink, FormsModule],
    templateUrl: './courses.component.html',
    styleUrl: './courses.component.scss',
})
export class CoursesComponent implements OnInit {

    private readonly auth = inject(AuthService);
    private readonly courseService = inject(CourseService);

    readonly loading = this.courseService.loading;
    readonly searchQuery = signal('');
    readonly filterFavourites = signal(false);
    readonly brokenImages = signal(new Set<number>());

    readonly filteredCourses = computed(() => {
        let courses = this.courseService.courses();
        const query = this.searchQuery().toLowerCase().trim();
        const favsOnly = this.filterFavourites();

        if (favsOnly) {
            courses = courses.filter((c) => c.isfavourite);
        }
        if (query) {
            courses = courses.filter((c) =>
                c.fullname.toLowerCase().includes(query) ||
                c.shortname.toLowerCase().includes(query),
            );
        }
        return courses;
    });

    async ngOnInit(): Promise<void> {
        const userId = this.auth.session()?.siteInfo.userid;
        if (userId && this.courseService.courses().length === 0) {
            await this.courseService.loadCourses(userId);
        }
    }

    hasCourseImage(course: Course): boolean {
        if (this.brokenImages().has(course.id)) return false;
        const img = course.courseImage;
        if (!img) return false;
        // Moodle default course images are not custom uploads
        if (img.includes('/course/generated/') || img.includes('course_defaultimage')) return false;
        return true;
    }

    onImageError(courseId: number): void {
        this.brokenImages.update((set) => {
            const next = new Set(set);
            next.add(courseId);
            return next;
        });
    }

    getCourseInitials(course: Course): string {
        const words = (course.shortname || course.fullname).trim().split(/\s+/);
        if (words.length >= 2) {
            return (words[0][0] + words[1][0]).toUpperCase();
        }
        return words[0].slice(0, 2).toUpperCase();
    }

    /** Deterministic gradient from course name using a simple hash. */
    getCourseColor(course: Course): string {
        const palettes: [string, string][] = [
            ['#5C6BC0', '#3949AB'],
            ['#26A69A', '#00897B'],
            ['#EF5350', '#E53935'],
            ['#FFA726', '#FB8C00'],
            ['#AB47BC', '#8E24AA'],
            ['#42A5F5', '#1E88E5'],
            ['#66BB6A', '#43A047'],
            ['#EC407A', '#D81B60'],
            ['#26C6DA', '#00ACC1'],
            ['#8D6E63', '#6D4C41'],
        ];
        const str = course.shortname || course.fullname;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff;
        }
        const [from, to] = palettes[Math.abs(hash) % palettes.length];
        return `linear-gradient(135deg, ${from}, ${to})`;
    }

    getProgressPercentage(course: Course): string {
        if (course.progress === null || course.progress === undefined) return '0%';
        return `${Math.round(course.progress)}%`;
    }

    toggleFavourites(): void {
        this.filterFavourites.update((v) => !v);
    }
}
