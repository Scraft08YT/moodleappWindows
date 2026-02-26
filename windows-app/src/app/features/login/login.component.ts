import { Component, signal, inject, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { TitlebarComponent } from '../../shared/components/titlebar/titlebar.component';
import { ThemeService } from '../../core/services/theme.service';

/**
 * Login page with site URL, username, and password fields.
 * Full-screen centred card with Fluent Design.
 */
@Component({
    selector: 'app-login',
    standalone: true,
    imports: [FormsModule, TitlebarComponent],
    templateUrl: './login.component.html',
    styleUrl: './login.component.scss',
})
export class LoginComponent {

    private readonly auth = inject(AuthService);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    private readonly theme = inject(ThemeService);

    readonly siteUrl = signal('');
    readonly username = signal('');
    readonly password = signal('');
    readonly loading = signal(false);
    readonly error = signal('');
    readonly showPassword = signal(false);
    readonly isDark = this.theme.isDark;

    /** Whether the user can navigate back (has existing accounts/session). */
    readonly canGoBack = computed(() => {
        const params = this.route.snapshot.queryParams;
        return params['addAccount'] === '1' || this.auth.isAuthenticated();
    });

    async login(): Promise<void> {
        if (!this.siteUrl() || !this.username() || !this.password()) {
            this.error.set('Bitte alle Felder ausfüllen.');
            return;
        }

        this.loading.set(true);
        this.error.set('');

        try {
            await this.auth.login(this.siteUrl(), this.username(), this.password());
            await this.router.navigate(['/dashboard']);
        } catch (err) {
            this.error.set(
                err instanceof Error ? err.message : 'Verbindung fehlgeschlagen. Bitte überprüfe die Eingaben.',
            );
        } finally {
            this.loading.set(false);
        }
    }

    togglePassword(): void {
        this.showPassword.update((v) => !v);
    }

    toggleTheme(): void {
        this.theme.toggle();
    }

    goBack(): void {
        void this.router.navigate(['/dashboard']);
    }
}
