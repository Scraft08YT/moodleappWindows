import { Component, signal, computed, inject } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';

import { TitlebarComponent } from '../../components/titlebar/titlebar.component';
import { SidebarComponent } from '../../components/sidebar/sidebar.component';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { NotificationService } from '../../../core/services/notification.service';
import { MessageService } from '../../../core/services/message.service';
import { OfflineCacheService } from '../../../core/services/offline-cache.service';
import { StoredAccount } from '../../../core/models/user.model';

/**
 * The main application shell with titlebar, sidebar, and content area.
 * Wraps all authenticated routes.
 */
@Component({
    selector: 'app-shell',
    standalone: true,
    imports: [
        RouterOutlet,
        TitlebarComponent,
        SidebarComponent,
    ],
    templateUrl: './shell.component.html',
    styleUrl: './shell.component.scss',
})
export class ShellComponent {

    private readonly auth = inject(AuthService);
    private readonly theme = inject(ThemeService);
    private readonly notifications = inject(NotificationService);
    private readonly messages = inject(MessageService);
    private readonly router = inject(Router);
    private readonly offlineCache = inject(OfflineCacheService);

    readonly sidebarCollapsed = signal(false);
    readonly isOffline = this.offlineCache.isOffline;
    readonly userFullName = this.auth.userFullName;
    readonly userAvatar = this.auth.userAvatar;
    readonly siteName = this.auth.siteName;
    readonly isDark = this.theme.isDark;
    readonly unreadNotifications = this.notifications.unreadCount;
    readonly unreadMessages = this.messages.totalUnread;
    readonly storedAccounts = this.auth.storedAccounts;
    readonly activeAccountId = this.auth.activeAccountId;

    readonly sidebarWidth = computed(() =>
        this.sidebarCollapsed() ? '60px' : '280px',
    );

    constructor() {
        // Load notifications and messages on shell init
        const session = this.auth.session();
        if (session) {
            void this.notifications.loadNotifications(session.siteInfo.userid);
            void this.messages.loadConversations(session.siteInfo.userid);
        }
    }

    toggleSidebar(): void {
        this.sidebarCollapsed.update((v) => !v);
    }

    toggleTheme(): void {
        this.theme.toggle();
    }

    async logout(): Promise<void> {
        await this.auth.logout();
    }

    async switchAccount(account: StoredAccount): Promise<void> {
        await this.auth.switchAccount(account);
    }

    async removeAccount(accountId: string): Promise<void> {
        await this.auth.removeAccount(accountId);
    }

    addAccount(): void {
        void this.router.navigate(['/login'], { queryParams: { addAccount: '1' } });
    }
}
