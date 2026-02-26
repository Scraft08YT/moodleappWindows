import { Component, inject, signal, computed, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';

import { AuthService } from '../../core/services/auth.service';
import { CourseService } from '../../core/services/course.service';
import { CalendarService } from '../../core/services/calendar.service';
import { NotificationService } from '../../core/services/notification.service';
import type { Course } from '../../core/models/course.model';
import type { CalendarEvent } from '../../core/models/calendar-event.model';

/**
 * Dashboard – the main landing page after login.
 * Shows greeting, recent courses, upcoming events, and notification summary.
 */
@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [RouterLink, DatePipe],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {

    private readonly auth = inject(AuthService);
    private readonly courseService = inject(CourseService);
    private readonly calendarService = inject(CalendarService);
    private readonly notificationService = inject(NotificationService);

    readonly greeting = computed(() => {
        const hour = new Date().getHours();
        const name = this.auth.session()?.siteInfo.firstname ?? '';
        if (hour < 12) return `Guten Morgen, ${name}`;
        if (hour < 18) return `Guten Tag, ${name}`;
        return `Guten Abend, ${name}`;
    });

    readonly recentCourses = computed(() =>
        this.courseService.courses().slice(0, 6),
    );

    readonly upcomingEvents = computed(() =>
        this.calendarService.events().slice(0, 5),
    );

    readonly unreadNotifications = this.notificationService.unreadCount;
    readonly coursesLoading = this.courseService.loading;
    readonly eventsLoading = this.calendarService.loading;
    readonly totalCourses = computed(() => this.courseService.courses().length);
    readonly brokenImages = signal(new Set<number>());

    async ngOnInit(): Promise<void> {
        const userId = this.auth.session()?.siteInfo.userid;
        if (!userId) return;

        await Promise.all([
            this.courseService.loadCourses(userId),
            this.calendarService.loadUpcomingEvents(5),
        ]);
    }

    hasCourseImage(course: Course): boolean {
        if (this.brokenImages().has(course.id)) return false;
        const img = course.courseImage;
        if (!img) return false;
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

    formatEventDate(event: CalendarEvent): string {
        const date = new Date(event.timeStart * 1000);
        return date.toLocaleDateString('de-DE', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    getProgressPercentage(course: Course): string {
        if (course.progress === null || course.progress === undefined) return '0%';
        return `${Math.round(course.progress)}%`;
    }
}
