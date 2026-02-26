import { Injectable, signal } from '@angular/core';

import { MoodleApiService } from './moodle-api.service';
import type { CalendarEvent, CalendarEventType } from '../models/calendar-event.model';

/**
 * Service for Moodle calendar events.
 *
 * Uses `core_calendar_get_action_events_by_timesort` for upcoming events
 * and `core_calendar_get_calendar_monthly_view` for monthly views.
 */
@Injectable({ providedIn: 'root' })
export class CalendarService {

    readonly events = signal<CalendarEvent[]>([]);
    readonly loading = signal(false);

    constructor(private readonly api: MoodleApiService) {}

    /** Loads upcoming action events (deadlines, submissions etc.). */
    async loadUpcomingEvents(limit = 26): Promise<void> {
        this.loading.set(true);
        try {
            const now = Math.floor(Date.now() / 1000);
            const result = await this.api.call<RawActionEventsResponse>(
                'core_calendar_get_action_events_by_timesort',
                { timesortfrom: now, limitnum: limit },
            );

            this.events.set((result.events ?? []).map((e) => this.mapEvent(e)));
        } finally {
            this.loading.set(false);
        }
    }

    /** Loads events for a specific month. */
    async loadMonthEvents(year: number, month: number): Promise<CalendarEvent[]> {
        const result = await this.api.call<RawMonthViewResponse>(
            'core_calendar_get_calendar_monthly_view',
            { year, month },
        );

        const events: CalendarEvent[] = [];
        for (const week of result.weeks ?? []) {
            for (const day of week.days ?? []) {
                for (const event of day.events ?? []) {
                    events.push(this.mapEvent(event));
                }
            }
        }
        return events;
    }

    private mapEvent(e: RawEvent): CalendarEvent {
        return {
            id: e.id,
            name: e.name,
            description: e.description ?? '',
            eventType: (e.eventtype ?? 'course') as CalendarEventType,
            courseId: e.course?.id ?? 0,
            courseName: e.course?.fullname ?? '',
            timeStart: e.timestart,
            timeDuration: e.timeduration ?? 0,
            moduleName: e.modulename ?? '',
            url: e.url ?? '',
            isActionEvent: !!e.action,
            actionUrl: e.action?.url ?? '',
            actionName: e.action?.name ?? '',
        };
    }
}

// Raw Moodle response types
type RawActionEventsResponse = {
    events: RawEvent[];
};

type RawMonthViewResponse = {
    weeks: { days: { events: RawEvent[] }[] }[];
};

type RawEvent = {
    id: number;
    name: string;
    description?: string;
    eventtype?: string;
    course?: { id: number; fullname: string };
    timestart: number;
    timeduration?: number;
    modulename?: string;
    url?: string;
    action?: { url: string; name: string };
};
