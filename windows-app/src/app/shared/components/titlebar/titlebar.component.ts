import { Component, input, output, signal, type OnInit, type OnDestroy, NgZone, inject } from '@angular/core';

/**
 * Custom titlebar component that replaces the native Windows titlebar.
 * Provides drag area, window controls (minimise, maximise/restore, close),
 * and a theme toggle button.
 */
@Component({
    selector: 'app-titlebar',
    standalone: true,
    templateUrl: './titlebar.component.html',
    styleUrl: './titlebar.component.scss',
})
export class TitlebarComponent implements OnInit, OnDestroy {

    private readonly zone = inject(NgZone);

    readonly siteName = input('Moodle Desktop');
    readonly isDark = input(false);

    readonly toggleThemeClick = output<void>();

    /** Tracks whether the window is currently maximised. */
    readonly isMaximised = signal(false);

    private unlisten?: () => void;
    private tauriWindow: Awaited<ReturnType<typeof import('@tauri-apps/api/window')['getCurrentWindow']>> | null = null;

    async ngOnInit(): Promise<void> {
        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            this.tauriWindow = getCurrentWindow();
            this.isMaximised.set(await this.tauriWindow.isMaximized());
            this.unlisten = await this.tauriWindow.onResized(async () => {
                const maximised = await this.tauriWindow!.isMaximized();
                this.zone.run(() => this.isMaximised.set(maximised));
            });
        } catch (err) {
            console.error('[Titlebar] Failed to init Tauri window API:', err);
        }
    }

    ngOnDestroy(): void {
        this.unlisten?.();
    }

    async minimise(): Promise<void> {
        try {
            if (!this.tauriWindow) {
                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                this.tauriWindow = getCurrentWindow();
            }
            await this.tauriWindow.minimize();
        } catch (err) {
            console.error('[Titlebar] minimise failed:', err);
        }
    }

    async maximise(): Promise<void> {
        try {
            if (!this.tauriWindow) {
                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                this.tauriWindow = getCurrentWindow();
            }
            await this.tauriWindow.toggleMaximize();
        } catch (err) {
            console.error('[Titlebar] maximise failed:', err);
        }
    }

    async close(): Promise<void> {
        try {
            if (!this.tauriWindow) {
                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                this.tauriWindow = getCurrentWindow();
            }
            await this.tauriWindow.close();
        } catch (err) {
            console.error('[Titlebar] close failed:', err);
        }
    }
}
