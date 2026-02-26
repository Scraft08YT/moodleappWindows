import { Component, inject, signal, type OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { CourseService } from '../../../core/services/course.service';
import type { SearchableCourse, EnrolmentMethod, CourseCategory } from '../../../core/services/course.service';

/**
 * Course search & enrolment page.
 * Shows a category browser by default and allows searching/enrolling.
 */
@Component({
    selector: 'app-course-search',
    standalone: true,
    imports: [FormsModule, RouterLink],
    templateUrl: './course-search.component.html',
    styleUrl: './course-search.component.scss',
})
export class CourseSearchComponent implements OnInit {

    private readonly courseService = inject(CourseService);
    private readonly auth = inject(AuthService);
    private readonly router = inject(Router);

    // Search state
    readonly searchQuery = signal('');
    readonly searchResults = signal<SearchableCourse[]>([]);
    readonly totalResults = signal(0);
    readonly searching = signal(false);
    readonly searched = signal(false);
    readonly currentPage = signal(0);

    // Category browsing state
    readonly categories = signal<CourseCategory[]>([]);
    readonly loadingCategories = signal(true);
    readonly expandedCategories = signal<Set<number>>(new Set());
    readonly categoryCourses = signal<Map<number, SearchableCourse[]>>(new Map());
    readonly loadingCategoryCourses = signal<Set<number>>(new Set());
    readonly breadcrumbs = signal<CourseCategory[]>([]);
    readonly currentParentId = signal<number>(0);

    // Enrolment dialog state
    readonly selectedCourse = signal<SearchableCourse | null>(null);
    readonly enrolMethods = signal<EnrolmentMethod[]>([]);
    readonly loadingMethods = signal(false);
    readonly enrolling = signal(false);
    readonly enrolPassword = signal('');
    readonly enrolError = signal('');
    readonly enrolSuccess = signal(false);
    readonly showPasswordField = signal(false);

    private searchTimeout: ReturnType<typeof setTimeout> | null = null;
    private readonly perPage = 20;

    async ngOnInit(): Promise<void> {
        await this.loadCategories(0);
    }

    /** Load categories for a given parent (0 = top-level). */
    async loadCategories(parentId: number): Promise<void> {
        this.loadingCategories.set(true);
        try {
            const allCategories = await this.courseService.getCategories();
            // Filter to only show children of the current parent
            const filtered = allCategories.filter((c) => c.parent === parentId);
            this.categories.set(filtered);
            this.currentParentId.set(parentId);

            // Build breadcrumbs by traversing up the tree
            if (parentId > 0) {
                const crumbs: CourseCategory[] = [];
                let current = allCategories.find((c) => c.id === parentId);
                while (current) {
                    crumbs.unshift(current);
                    current = current.parent > 0
                        ? allCategories.find((c) => c.id === current!.parent)
                        : undefined;
                }
                this.breadcrumbs.set(crumbs);
            } else {
                this.breadcrumbs.set([]);
            }
        } catch {
            this.categories.set([]);
        } finally {
            this.loadingCategories.set(false);
        }
    }

    /** Navigate into a sub-category. */
    async openCategory(category: CourseCategory): Promise<void> {
        // Check if it has sub-categories
        const allCategories = await this.courseService.getCategories();
        const children = allCategories.filter((c) => c.parent === category.id);

        if (children.length > 0) {
            // Navigate into this category
            this.categories.set(children);
            this.currentParentId.set(category.id);
            // Rebuild breadcrumbs
            const crumbs: CourseCategory[] = [];
            let current: CourseCategory | undefined = category;
            while (current) {
                crumbs.unshift(current);
                current = current.parent > 0
                    ? allCategories.find((c) => c.id === current!.parent)
                    : undefined;
            }
            this.breadcrumbs.set(crumbs);
        }

        // Always expand and load courses for this category
        await this.toggleCategory(category.id);
    }

    /** Toggle a category to show/hide its courses. */
    async toggleCategory(categoryId: number): Promise<void> {
        const expanded = this.expandedCategories();
        const next = new Set(expanded);

        if (next.has(categoryId)) {
            next.delete(categoryId);
            this.expandedCategories.set(next);
            return;
        }

        next.add(categoryId);
        this.expandedCategories.set(next);

        // Load courses if not already loaded
        if (!this.categoryCourses().has(categoryId)) {
            const loading = new Set(this.loadingCategoryCourses());
            loading.add(categoryId);
            this.loadingCategoryCourses.set(loading);

            try {
                const courses = await this.courseService.getCoursesByCategory(categoryId);
                const map = new Map(this.categoryCourses());
                map.set(categoryId, courses);
                this.categoryCourses.set(map);
            } catch {
                // silently fail
            } finally {
                const done = new Set(this.loadingCategoryCourses());
                done.delete(categoryId);
                this.loadingCategoryCourses.set(done);
            }
        }
    }

    /** Navigate to a breadcrumb level. */
    navigateToBreadcrumb(index: number): void {
        const crumbs = this.breadcrumbs();
        if (index < 0) {
            // Go to root
            void this.loadCategories(0);
        } else {
            const target = crumbs[index];
            void this.loadCategories(target.id);
        }
    }

    /** Check if a category is expanded. */
    isCategoryExpanded(categoryId: number): boolean {
        return this.expandedCategories().has(categoryId);
    }

    /** Get courses for a category. */
    getCoursesForCategory(categoryId: number): SearchableCourse[] {
        return this.categoryCourses().get(categoryId) ?? [];
    }

    /** Check if courses for a category are loading. */
    isCategoryLoading(categoryId: number): boolean {
        return this.loadingCategoryCourses().has(categoryId);
    }

    onSearchInput(): void {
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        this.searchTimeout = setTimeout(() => {
            void this.performSearch();
        }, 400);
    }

    async performSearch(page = 0): Promise<void> {
        const query = this.searchQuery().trim();
        if (query.length < 2) {
            this.searchResults.set([]);
            this.totalResults.set(0);
            this.searched.set(false);
            return;
        }

        this.searching.set(true);
        this.currentPage.set(page);

        try {
            const result = await this.courseService.searchCourses(query, page, this.perPage);
            this.searchResults.set(result.courses);
            this.totalResults.set(result.total);
        } catch {
            this.searchResults.set([]);
            this.totalResults.set(0);
        } finally {
            this.searching.set(false);
            this.searched.set(true);
        }
    }

    /** Open the enrolment dialog for a course. */
    async openEnrolDialog(course: SearchableCourse): Promise<void> {
        this.selectedCourse.set(course);
        this.enrolPassword.set('');
        this.enrolError.set('');
        this.enrolSuccess.set(false);
        this.showPasswordField.set(false);
        this.loadingMethods.set(true);

        try {
            const methods = await this.courseService.getEnrolmentMethods(course.id);
            this.enrolMethods.set(methods);
            // Show password field if a self-enrolment method exists
            const selfMethod = methods.find((m) => m.type === 'self');
            this.showPasswordField.set(!!selfMethod);
        } catch {
            this.enrolMethods.set([]);
        } finally {
            this.loadingMethods.set(false);
        }
    }

    closeEnrolDialog(): void {
        this.selectedCourse.set(null);
        this.enrolError.set('');
        this.enrolSuccess.set(false);
    }

    async enrol(): Promise<void> {
        const course = this.selectedCourse();
        if (!course) return;

        this.enrolling.set(true);
        this.enrolError.set('');

        // Find the self-enrolment method
        const selfMethod = this.enrolMethods().find((m) => m.type === 'self');

        try {
            const result = await this.courseService.selfEnrol(
                course.id,
                this.enrolPassword(),
                selfMethod?.id,
            );

            if (result.success) {
                this.enrolSuccess.set(true);
                // Reload the user's course list
                const userId = this.auth.session()?.siteInfo.userid;
                if (userId) {
                    await this.courseService.loadCourses(userId);
                }
            } else if (result.error === 'invalid_key') {
                this.enrolError.set('Falsches Einschreibepasswort. Bitte versuche es erneut.');
                this.showPasswordField.set(true);
            } else {
                this.enrolError.set(result.message ?? 'Einschreibung fehlgeschlagen.');
            }
        } catch (err: unknown) {
            this.enrolError.set(err instanceof Error ? err.message : 'Unbekannter Fehler.');
        } finally {
            this.enrolling.set(false);
        }
    }

    goToCourse(courseId: number): void {
        void this.router.navigate(['/courses', courseId]);
    }

    isEnrolled(courseId: number): boolean {
        return this.courseService.isEnrolled(courseId);
    }

    /** Strip HTML tags from summaries. */
    stripHtml(html: string): string {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent?.trim() ?? '';
    }

    getCourseInitials(course: SearchableCourse): string {
        const words = (course.shortname || course.fullname).trim().split(/\s+/);
        if (words.length >= 2) {
            return (words[0][0] + words[1][0]).toUpperCase();
        }
        return words[0].slice(0, 2).toUpperCase();
    }

    getCourseColor(course: SearchableCourse): string {
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

    get hasMorePages(): boolean {
        return (this.currentPage() + 1) * this.perPage < this.totalResults();
    }

    get hasPrevPage(): boolean {
        return this.currentPage() > 0;
    }

    totalPages(): number {
        return Math.ceil(this.totalResults() / this.perPage);
    }

    nextPage(): void {
        void this.performSearch(this.currentPage() + 1);
    }

    prevPage(): void {
        if (this.currentPage() > 0) {
            void this.performSearch(this.currentPage() - 1);
        }
    }

    getEnrolMethodLabel(type: string): string {
        const labels: Record<string, string> = {
            self: 'Selbsteinschreibung',
            guest: 'Gastzugang',
            manual: 'Manuelle Einschreibung',
            cohort: 'Globale Gruppen',
            meta: 'Kursverknüpfung',
            paypal: 'PayPal',
        };
        return labels[type] ?? type;
    }

    hasSelfEnrolment(): boolean {
        return this.enrolMethods().some((m) => m.type === 'self');
    }
}
