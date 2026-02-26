import { Component, inject, signal, type OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { ThemeService, type AppTheme } from '../../core/services/theme.service';
import { AuthService } from '../../core/services/auth.service';
import { StorageService } from '../../core/services/storage.service';
import { UpdateService } from '../../core/services/update.service';

/**
 * Settings page – theme selection, account info, cache management, update & about section.
 */
@Component({
    selector: 'app-settings',
    standalone: true,
    templateUrl: './settings.component.html',
    styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {

    private readonly themeService = inject(ThemeService);
    private readonly auth = inject(AuthService);
    private readonly storage = inject(StorageService);
    private readonly router = inject(Router);
    readonly updateService = inject(UpdateService);

    readonly theme = this.themeService.theme;
    readonly session = this.auth.session;
    readonly appVersion = this.updateService.currentVersion;
    readonly cacheCleared = signal(false);

    async ngOnInit(): Promise<void> {
        await this.updateService.loadVersion();
    }

    readonly themeOptions: { value: AppTheme; label: string; icon: string }[] = [
        { value: 'light', label: 'Hell', icon: '☀️' },
        { value: 'dark', label: 'Dunkel', icon: '🌙' },
        { value: 'system', label: 'System', icon: '💻' },
    ];

    setTheme(mode: AppTheme): void {
        this.themeService.setTheme(mode);
    }

    async clearCache(): Promise<void> {
        await this.storage.clear();
        this.cacheCleared.set(true);
        setTimeout(() => this.cacheCleared.set(false), 3000);
    }

    async logout(): Promise<void> {
        await this.auth.logout();
        await this.router.navigate(['/login']);
    }

    get siteUrl(): string {
        return this.session()?.siteUrl ?? '';
    }

    get userName(): string {
        const info = this.session()?.siteInfo;
        if (!info) return '';

        return `${info.firstname} ${info.lastname}`;
    }

    get userEmail(): string {
        return this.session()?.siteInfo.email ?? '-';
    }

    async checkForUpdate(): Promise<void> {
        await this.updateService.checkForUpdate();
    }

    async installUpdate(): Promise<void> {
        await this.updateService.downloadAndInstall();
    }
}
