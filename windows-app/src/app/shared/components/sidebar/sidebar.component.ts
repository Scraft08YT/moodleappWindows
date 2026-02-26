import { Component, input, output, computed, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import type { StoredAccount } from '../../../core/models/user.model';

/**
 * Sidebar navigation with collapsible menu, user info, account switcher,
 * and navigation items. Follows Windows 11 NavigationView pattern.
 */
@Component({
    selector: 'app-sidebar',
    standalone: true,
    imports: [RouterLink, RouterLinkActive],
    templateUrl: './sidebar.component.html',
    styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {

    readonly collapsed = input(false);
    readonly userFullName = input('');
    readonly userAvatar = input('');
    readonly unreadMessages = input(0);
    readonly unreadNotifications = input(0);
    readonly storedAccounts = input<StoredAccount[]>([]);
    readonly activeAccountId = input('');

    readonly toggleClick = output<void>();
    readonly logoutClick = output<void>();
    readonly switchAccountClick = output<StoredAccount>();
    readonly removeAccountClick = output<string>();
    readonly addAccountClick = output<void>();

    /** Whether the account switcher flyout is open. */
    readonly showAccountSwitcher = signal(false);

    readonly userInitials = computed(() => {
        const name = this.userFullName();
        if (!name) return '?';
        const parts = name.split(' ').filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    });

    /** Accounts other than the currently active one. */
    readonly otherAccounts = computed(() =>
        this.storedAccounts().filter((a) => a.id !== this.activeAccountId()),
    );

    readonly navItems: NavItem[] = [
        { label: 'Dashboard', route: '/dashboard', icon: 'home' },
        { label: 'Kurse', route: '/courses', icon: 'book', exact: true },
        { label: 'Kurse finden', route: '/courses/search', icon: 'search' },
        { label: 'Noten', route: '/grades', icon: 'grades' },
        { label: 'Nachrichten', route: '/messages', icon: 'chat', badgeKey: 'messages' },
        { label: 'Kalender', route: '/calendar', icon: 'calendar' },
        { label: 'Benachrichtigungen', route: '/notifications', icon: 'bell', badgeKey: 'notifications' },
        { label: 'Dateien', route: '/files', icon: 'folder' },
        { label: 'Profil', route: '/profile', icon: 'person' },
    ];

    readonly bottomItems: NavItem[] = [
        { label: 'Einstellungen', route: '/settings', icon: 'settings' },
    ];

    getBadgeCount(item: NavItem): number {
        if (item.badgeKey === 'messages') return this.unreadMessages();
        if (item.badgeKey === 'notifications') return this.unreadNotifications();
        return 0;
    }

    toggleAccountSwitcher(): void {
        this.showAccountSwitcher.update((v) => !v);
    }

    getAccountInitials(name: string): string {
        if (!name) return '?';
        const parts = name.split(' ').filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    onSwitchAccount(account: StoredAccount): void {
        this.showAccountSwitcher.set(false);
        this.switchAccountClick.emit(account);
    }

    onRemoveAccount(event: Event, accountId: string): void {
        event.stopPropagation();
        this.removeAccountClick.emit(accountId);
    }

    onAddAccount(): void {
        this.showAccountSwitcher.set(false);
        this.addAccountClick.emit();
    }
}

type NavItem = {
    label: string;
    route: string;
    icon: string;
    badgeKey?: string;
    exact?: boolean;
};
