import { Pipe, type PipeTransform, inject } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { MoodleApiService } from '../../core/services/moodle-api.service';

/**
 * Pipe that prepares Moodle HTML for safe rendering in `[innerHTML]`.
 *
 * 1. Rewrites `pluginfile.php` URLs to include the WS token.
 * 2. Bypasses Angular's built-in HTML sanitiser so that `<iframe>`,
 *    `<video>`, `<audio>`, inline `style` attributes etc. are preserved.
 *
 * Usage:  `[innerHTML]="rawHtml | safeHtml"`
 */
@Pipe({ name: 'safeHtml', standalone: true, pure: true })
export class SafeHtmlPipe implements PipeTransform {

    private readonly sanitizer = inject(DomSanitizer);
    private readonly api = inject(MoodleApiService);

    transform(value: string | null | undefined): SafeHtml {
        if (!value) return '';
        const rewritten = this.api.rewritePluginfileUrls(value);
        return this.sanitizer.bypassSecurityTrustHtml(rewritten);
    }
}
