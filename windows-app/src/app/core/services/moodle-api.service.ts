import { inject, Injectable } from '@angular/core';

import { OfflineCacheService } from './offline-cache.service';

/**
 * Low-level service for calling Moodle Web Service functions.
 *
 * The service is configured with a site URL and token by AuthService
 * after login. All other services use this to communicate with Moodle.
 *
 * Integrates with OfflineCacheService for transparent offline support:
 * - Online: calls API, caches the result.
 * - Offline: returns cached data if available, throws if not.
 */
@Injectable({ providedIn: 'root' })
export class MoodleApiService {

    private readonly offlineCache = inject(OfflineCacheService);

    private siteUrl = '';
    private token = '';

    /** Configures the API endpoint. Called by AuthService. */
    configure(siteUrl: string, token: string): void {
        this.siteUrl = siteUrl;
        this.token = token;
    }

    /**
     * Calls a Moodle Web Service function.
     *
     * When online the response is cached transparently.
     * When offline, the cache is used as fallback.
     *
     * @param wsFunction  WS function name, e.g. `core_course_get_contents`
     * @param params      Additional parameters as key-value pairs
     * @param options      Optional call settings
     * @param options.skipCache  When true, bypasses the fresh-cache check and always fetches from the network.
     *                          The network response is still cached for future calls.
     * @returns The parsed JSON response
     * @throws Error if the response contains an `exception` or `errorcode`
     */
    async call<T>(
        wsFunction: string,
        params: Record<string, unknown> = {},
        options?: { skipCache?: boolean },
    ): Promise<T> {
        if (!this.siteUrl || !this.token) {
            throw new Error('API not configured. Call AuthService.login() first.');
        }

        // If offline, try cache immediately
        if (!navigator.onLine) {
            const cached = await this.offlineCache.getStale<T>(wsFunction, params);
            if (cached !== null) return cached;
            throw new Error('Offline – keine gecachten Daten verfügbar.');
        }

        // Check fresh cache first to avoid redundant network calls
        if (!options?.skipCache) {
            const freshCached = await this.offlineCache.get<T>(wsFunction, params);
            if (freshCached !== null) return freshCached;
        }

        try {
            const data = await this.fetchFromNetwork<T>(wsFunction, params);

            // Cache the successful response (fire-and-forget)
            void this.offlineCache.put(wsFunction, params, data);

            return data;
        } catch (err) {
            // Network error – try stale cache as fallback
            const stale = await this.offlineCache.getStale<T>(wsFunction, params);
            if (stale !== null) return stale;
            throw err;
        }
    }

    /** Performs the actual network request to Moodle WS. */
    private async fetchFromNetwork<T>(wsFunction: string, params: Record<string, unknown>): Promise<T> {

        const url = `${this.siteUrl}/webservice/rest/server.php`;
        const body = new URLSearchParams({
            wstoken: this.token,
            wsfunction: wsFunction,
            moodlewsrestformat: 'json',
        });

        // Flatten nested params for Moodle WS format
        this.flattenParams(params, body);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json() as Record<string, unknown>;

        // Moodle WS error format
        if (data['exception'] || data['errorcode']) {
            const msg = (data['message'] as string) ?? (data['error'] as string) ?? 'Unknown Moodle error';
            throw new Error(`Moodle WS Error [${data['errorcode']}]: ${msg}`);
        }

        return data as T;
    }

    /**
     * Builds a URL for downloading a file from Moodle with the current token appended.
     *
     * Only appends the token if the file URL belongs to the configured site
     * to prevent token leakage to third-party domains.
     *
     * @param fileUrl  The raw file URL from a Moodle WS response
     * @returns URL with token query parameter
     */
    getFileUrl(fileUrl: string): string {
        if (!fileUrl) {
            return '';
        }

        // Only attach token to URLs on the configured Moodle site
        try {
            const fileOrigin = new URL(fileUrl).origin;
            const siteOrigin = new URL(this.siteUrl).origin;
            if (fileOrigin !== siteOrigin) {
                return fileUrl; // External URL – do not leak token
            }
        } catch {
            return fileUrl;
        }

        const separator = fileUrl.includes('?') ? '&' : '?';
        return `${fileUrl}${separator}token=${this.token}`;
    }

    /**
     * Rewrites pluginfile URLs in HTML content to include the WS token.
     *
     * Moodle's `external_format_text()` generates `webservice/pluginfile.php` URLs
     * in HTML content, but those URLs require the WS token as a query parameter
     * for authentication. This method appends the token to all such URLs while
     * leaving `tokenpluginfile.php` URLs untouched (they already carry embedded auth).
     *
     * Also replaces any remaining `@@PLUGINFILE@@` placeholders as a safety net
     * for older Moodle versions.
     *
     * @param html  Raw HTML string from the Moodle WS response
     * @returns HTML with authenticated pluginfile URLs
     */
    rewritePluginfileUrls(html: string): string {
        if (!html || !this.siteUrl || !this.token) return html;

        // Safety net: replace @@PLUGINFILE@@ placeholders (older Moodle)
        if (html.includes('@@PLUGINFILE@@')) {
            html = html.replace(
                /@@PLUGINFILE@@/g,
                `${this.siteUrl}/webservice/pluginfile.php`,
            );
        }

        // Append token to pluginfile.php URLs from this Moodle site.
        // Matches /pluginfile.php/ and /webservice/pluginfile.php/ but
        // NOT /tokenpluginfile.php/ (which carries auth in the URL path).
        const escapedSite = this.siteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(
            `(${escapedSite}/(?:webservice/)?pluginfile\\.php/[^"'\\s<>]*)`,
            'gi',
        );

        return html.replace(re, (url) => {
            if (url.includes('token=')) return url;
            const sep = url.includes('?') ? '&' : '?';
            return `${url}${sep}token=${this.token}`;
        });
    }

    /** Returns the current session info for direct upload endpoints. */
    getSession(): { siteUrl: string; token: string } | null {
        if (!this.siteUrl || !this.token) return null;
        return { siteUrl: this.siteUrl, token: this.token };
    }

    /** Recursively flattens nested objects/arrays into Moodle WS parameter format. */
    private flattenParams(
        params: Record<string, unknown>,
        target: URLSearchParams,
        prefix = '',
    ): void {
        for (const [key, value] of Object.entries(params)) {
            const fullKey = prefix ? `${prefix}[${key}]` : key;

            if (Array.isArray(value)) {
                value.forEach((item, index) => {
                    if (typeof item === 'object' && item !== null) {
                        this.flattenParams(item as Record<string, unknown>, target, `${fullKey}[${index}]`);
                    } else {
                        target.append(`${fullKey}[${index}]`, String(item));
                    }
                });
            } else if (typeof value === 'object' && value !== null) {
                this.flattenParams(value as Record<string, unknown>, target, fullKey);
            } else {
                target.append(fullKey, String(value));
            }
        }
    }
}
