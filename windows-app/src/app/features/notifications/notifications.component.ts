import { Component, inject, type OnInit } from '@angular/core';

import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

/**
 * Notifications page – displays popup notifications with read/unread state.
 */
@Component({
    selector: 'app-notifications',
    standalone: true,
    templateUrl: './notifications.component.html',
    styleUrl: './notifications.component.scss',
})
export class NotificationsComponent implements OnInit {

    private readonly auth = inject(AuthService);
    private readonly notificationService = inject(NotificationService);

    readonly notifications = this.notificationService.notifications;
    readonly loading = this.notificationService.loading;
    readonly unreadCount = this.notificationService.unreadCount;

    async ngOnInit(): Promise<void> {
        const userId = this.auth.session()?.siteInfo.userid;
        if (userId) {
            await this.notificationService.loadNotifications(userId);
        }
    }

    async markAsRead(id: number): Promise<void> {
        await this.notificationService.markAsRead(id);
    }

    async markAllAsRead(): Promise<void> {
        const unread = this.notifications().filter((n) => !n.read);
        await Promise.all(unread.map((n) => this.notificationService.markAsRead(n.id)));
    }

    formatDate(timestamp: number): string {
        const date = new Date(timestamp * 1000);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMin = Math.floor(diffMs / 60_000);
        const diffH = Math.floor(diffMin / 60);
        const diffD = Math.floor(diffH / 24);

        if (diffMin < 1) return 'Gerade eben';
        if (diffMin < 60) return `vor ${diffMin} Min.`;
        if (diffH < 24) return `vor ${diffH} Std.`;
        if (diffD < 7) return `vor ${diffD} Tagen`;

        return date.toLocaleDateString('de-DE', {
            day: 'numeric',
            month: 'short',
            year: now.getFullYear() !== date.getFullYear() ? 'numeric' : undefined,
        });
    }
}
