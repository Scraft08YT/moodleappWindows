import { Injectable, signal } from '@angular/core';

import { MoodleApiService } from './moodle-api.service';
import type { AppNotification } from '../models/notification.model';

/**
 * Service for fetching and managing Moodle notifications.
 *
 * Calls `message_popup_get_popup_notifications` and tracks unread count.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {

    readonly notifications = signal<AppNotification[]>([]);
    readonly unreadCount = signal(0);
    readonly loading = signal(false);

    constructor(private readonly api: MoodleApiService) {}

    /** Fetches the latest notifications for the current user. */
    async loadNotifications(userId: number): Promise<void> {
        this.loading.set(true);
        try {
            const result = await this.api.call<NotificationsResponse>(
                'message_popup_get_popup_notifications',
                { useridto: userId, limit: 50, offset: 0 },
            );

            const mapped: AppNotification[] = result.notifications.map((n) => ({
                id: n.id,
                userId: n.useridfrom,
                subject: n.subject,
                fullMessage: n.fullmessage,
                fullMessageHtml: n.fullmessagehtml,
                smallMessage: n.smallmessage,
                component: n.component,
                eventType: n.eventtype,
                contextUrl: n.contexturl,
                contextUrlName: n.contexturlname,
                timeCreated: n.timecreated,
                read: n.read,
                iconUrl: n.iconurl,
            }));

            this.notifications.set(mapped);
            this.unreadCount.set(result.unreadcount);
        } finally {
            this.loading.set(false);
        }
    }

    /** Marks a notification as read. */
    async markAsRead(notificationId: number): Promise<void> {
        await this.api.call('core_message_mark_notification_read', {
            notificationid: notificationId,
            timeread: Math.floor(Date.now() / 1000),
        });

        this.notifications.update((list) =>
            list.map((n) => (n.id === notificationId ? { ...n, read: true } : n)),
        );
        this.unreadCount.update((c) => Math.max(0, c - 1));
    }
}

/** Raw Moodle response shape. */
type NotificationsResponse = {
    notifications: RawNotification[];
    unreadcount: number;
};

type RawNotification = {
    id: number;
    useridfrom: number;
    subject: string;
    fullmessage: string;
    fullmessagehtml: string;
    smallmessage: string;
    component: string;
    eventtype: string;
    contexturl: string;
    contexturlname: string;
    timecreated: number;
    read: boolean;
    iconurl: string;
};
