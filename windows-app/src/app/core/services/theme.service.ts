import { Injectable, signal, computed, effect } from '@angular/core';

export type AppTheme = 'light' | 'dark' | 'system';

/**
 * Manages the application theme (light / dark / system).
 *
 * Applies the selected theme as a `data-theme` attribute on `<html>`
 * and persists the preference via localStorage.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {

    private static readonly STORAGE_KEY = 'moodle_theme';

    private readonly themeSignal = signal<AppTheme>(this.loadStoredTheme());

    /** The currently selected theme preference. */
    readonly theme = this.themeSignal.asReadonly();

    /** The effective theme after resolving 'system'. */
    readonly effectiveTheme = computed<'light' | 'dark'>(() => {
        const pref = this.themeSignal();
        if (pref === 'system') {
            return this.systemPrefersDark() ? 'dark' : 'light';
        }
        return pref;
    });

    /** Whether the effective theme is dark. */
    readonly isDark = computed(() => this.effectiveTheme() === 'dark');

    private readonly systemPrefersDark = signal(
        window.matchMedia('(prefers-color-scheme: dark)').matches,
    );

    constructor() {
        // Listen for OS theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            this.systemPrefersDark.set(e.matches);
        });

        // Apply theme to DOM whenever it changes
        effect(() => {
            const theme = this.effectiveTheme();
            document.documentElement.setAttribute('data-theme', theme);
            document.documentElement.style.colorScheme = theme;
        });
    }

    /** Sets the theme preference and persists it. */
    setTheme(theme: AppTheme): void {
        this.themeSignal.set(theme);
        localStorage.setItem(ThemeService.STORAGE_KEY, theme);
    }

    /** Toggles between light and dark (ignoring system). */
    toggle(): void {
        this.setTheme(this.effectiveTheme() === 'dark' ? 'light' : 'dark');
    }

    private loadStoredTheme(): AppTheme {
        const stored = localStorage.getItem(ThemeService.STORAGE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
            return stored;
        }
        return 'system';
    }
}
