/** Calendar event returned by core_calendar_get_calendar_events. */
export type CalendarEvent = {
    id: number;
    name: string;
    description: string;
    eventType: CalendarEventType;
    courseId: number;
    courseName: string;
    timeStart: number;
    /** Duration in seconds; 0 for instant events. */
    timeDuration: number;
    /** Module name if this event belongs to an activity, e.g. 'assign'. */
    moduleName: string;
    url: string;
    /** Whether the event action is already completed. */
    isActionEvent: boolean;
    actionUrl: string;
    actionName: string;
};

export type CalendarEventType =
    | 'site'
    | 'course'
    | 'category'
    | 'user'
    | 'group';
