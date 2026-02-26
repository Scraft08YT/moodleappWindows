import { Component, inject, signal, computed, type OnInit } from '@angular/core';

import { CalendarService } from '../../core/services/calendar.service';
import type { CalendarEvent } from '../../core/models/calendar-event.model';

/**
 * Calendar page – shows events in a monthly grid and an upcoming events list.
 */
@Component({
    selector: 'app-calendar',
    standalone: true,
    templateUrl: './calendar.component.html',
    styleUrl: './calendar.component.scss',
})
export class CalendarComponent implements OnInit {

    private readonly calendarService = inject(CalendarService);

    readonly loading = this.calendarService.loading;
    readonly currentDate = signal(new Date());
    readonly monthEvents = signal<CalendarEvent[]>([]);

    readonly currentYear = computed(() => this.currentDate().getFullYear());
    readonly currentMonth = computed(() => this.currentDate().getMonth());
    readonly monthName = computed(() =>
        this.currentDate().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
    );

    readonly weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

    readonly calendarDays = computed(() => {
        const year = this.currentYear();
        const month = this.currentMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        // Adjust to Monday start (0 = Mon, 6 = Sun)
        let startOffset = firstDay.getDay() - 1;
        if (startOffset < 0) startOffset = 6;

        const days: CalendarDay[] = [];

        // Previous month padding
        for (let i = startOffset - 1; i >= 0; i--) {
            const d = new Date(year, month, -i);
            days.push({ date: d, isCurrentMonth: false, events: [] });
        }

        // Current month
        for (let d = 1; d <= lastDay.getDate(); d++) {
            const date = new Date(year, month, d);
            const dayEvents = this.monthEvents().filter((e) => {
                const eDate = new Date(e.timeStart * 1000);
                return eDate.getDate() === d && eDate.getMonth() === month && eDate.getFullYear() === year;
            });
            days.push({ date, isCurrentMonth: true, events: dayEvents });
        }

        // Next month padding to fill 6 rows
        const remaining = 42 - days.length;
        for (let i = 1; i <= remaining; i++) {
            days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false, events: [] });
        }

        return days;
    });

    readonly upcomingEvents = computed(() =>
        this.calendarService.events().slice(0, 10),
    );

    readonly today = new Date();

    async ngOnInit(): Promise<void> {
        await Promise.all([
            this.loadMonth(),
            this.calendarService.loadUpcomingEvents(10),
        ]);
    }

    async previousMonth(): Promise<void> {
        this.currentDate.update((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
        await this.loadMonth();
    }

    async nextMonth(): Promise<void> {
        this.currentDate.update((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
        await this.loadMonth();
    }

    isToday(date: Date): boolean {
        return date.toDateString() === this.today.toDateString();
    }

    formatEventTime(event: CalendarEvent): string {
        return new Date(event.timeStart * 1000).toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    formatEventDateTime(event: CalendarEvent): string {
        return new Date(event.timeStart * 1000).toLocaleDateString('de-DE', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    private async loadMonth(): Promise<void> {
        const events = await this.calendarService.loadMonthEvents(
            this.currentYear(),
            this.currentMonth() + 1, // Moodle uses 1-indexed months
        );
        this.monthEvents.set(events);
    }
}

type CalendarDay = {
    date: Date;
    isCurrentMonth: boolean;
    events: CalendarEvent[];
};
