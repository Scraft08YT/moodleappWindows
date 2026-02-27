import { Component, inject, signal, computed, type OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';

import { AuthService } from '../../core/services/auth.service';
import { UserProfileService } from '../../core/services/user-profile.service';
import type { UserProfile } from '../../core/models/profile.model';
import { SafeHtmlPipe } from '../../shared/pipes/safe-html.pipe';

/**
 * User profile page — shows avatar, details, enrolled courses, and custom fields.
 */
@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [RouterLink, DatePipe, SafeHtmlPipe],
    templateUrl: './profile.component.html',
    styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit {

    private readonly route = inject(ActivatedRoute);
    private readonly auth = inject(AuthService);
    private readonly profileService = inject(UserProfileService);

    readonly profile = signal<UserProfile | null>(null);
    readonly loading = signal(true);
    readonly error = signal('');

    readonly isOwnProfile = computed(() => {
        const p = this.profile();
        const uid = this.auth.session()?.siteInfo.userid;
        return p != null && uid != null && p.id === uid;
    });

    async ngOnInit(): Promise<void> {
        const paramId = this.route.snapshot.paramMap.get('id');
        const userId = paramId ? Number(paramId) : this.auth.session()?.siteInfo.userid;

        if (!userId) {
            this.error.set('Kein Benutzer angegeben.');
            this.loading.set(false);
            return;
        }

        try {
            const p = await this.profileService.getUserProfile(userId);
            this.profile.set(p);
        } catch (err) {
            console.error('Failed to load profile:', err);
            this.error.set('Profil konnte nicht geladen werden.');
        } finally {
            this.loading.set(false);
        }
    }

    getInitials(name: string): string {
        if (!name) return '?';
        const parts = name.split(' ').filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    formatTimestamp(ts: number): Date | null {
        return ts ? new Date(ts * 1000) : null;
    }
}
