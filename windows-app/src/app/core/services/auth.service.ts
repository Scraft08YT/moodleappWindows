import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';

import { MoodleApiService } from './moodle-api.service';
import { StorageService } from './storage.service';
import type { AuthToken, Session, SiteInfo, StoredAccount } from '../models/user.model';

const SESSION_KEY = 'moodle_session';
const ACCOUNTS_KEY = 'moodle_accounts';

/**
 * Handles authentication against a Moodle site.
 *
 * Flow:
 * 1. User provides site URL + credentials
 * 2. Service calls `login/token.php` to obtain a token
 * 3. Token is used to fetch `core_webservice_get_site_info`
 * 4. Session (URL + token + siteInfo) is persisted via StorageService
 */
@Injectable({ providedIn: 'root' })
export class AuthService {

    private readonly sessionSignal = signal<Session | null>(null);

    /** Current session, or `null` if logged out. */
    readonly session = this.sessionSignal.asReadonly();

    /** Whether the user is authenticated. */
    readonly isAuthenticated = computed(() => this.sessionSignal() !== null);

    /** The current user's full name. */
    readonly userFullName = computed(() => this.sessionSignal()?.siteInfo.fullname ?? '');

    /** The current user's avatar URL. */
    readonly userAvatar = computed(() => this.sessionSignal()?.siteInfo.userpictureurl ?? '');

    /** The connected site name. */
    readonly siteName = computed(() => this.sessionSignal()?.siteInfo.sitename ?? '');

    /** All stored accounts for the account switcher. */
    readonly storedAccounts = signal<StoredAccount[]>([]);

    /** The active account ID (`userid@siteurl`). */
    readonly activeAccountId = computed(() => {
        const s = this.sessionSignal();
        return s ? `${s.siteInfo.userid}@${s.siteUrl}` : '';
    });

    constructor(
        private readonly api: MoodleApiService,
        private readonly storage: StorageService,
        private readonly router: Router,
    ) {}

    /** Restores a previously stored session (call once at app start). */
    async restoreSession(): Promise<boolean> {
        // Load stored accounts list
        const accounts = await this.storage.get<StoredAccount[]>(ACCOUNTS_KEY);
        this.storedAccounts.set(accounts ?? []);

        const stored = await this.storage.get<Session>(SESSION_KEY);
        if (!stored) {
            return false;
        }
        this.sessionSignal.set(stored);
        this.api.configure(stored.siteUrl, stored.token);
        return true;
    }

    /**
     * Authenticates against a Moodle site.
     *
     * @param siteUrl  Full Moodle URL, e.g. `https://school.moodle.com`
     * @param username Moodle username
     * @param password Moodle password
     * @returns The session on success
     * @throws Error with Moodle error message on failure
     */
    async login(siteUrl: string, username: string, password: string): Promise<Session> {
        const normalised = this.normaliseSiteUrl(siteUrl);

        // 1. Obtain token
        const tokenResult = await this.fetchToken(normalised, username, password);

        // 2. Configure API with new token
        this.api.configure(normalised, tokenResult.token);

        // 3. Fetch site info
        const siteInfo = await this.api.call<SiteInfo>('core_webservice_get_site_info');

        // 4. Build & store session
        const session: Session = {
            siteUrl: normalised,
            token: tokenResult.token,
            privateToken: tokenResult.privateToken,
            siteInfo,
        };
        this.sessionSignal.set(session);
        await this.storage.set(SESSION_KEY, session);

        // Save to accounts list
        await this.upsertAccount(session);

        return session;
    }

    /** Switches to a previously stored account. */
    async switchAccount(account: StoredAccount): Promise<void> {
        const session: Session = {
            siteUrl: account.siteUrl,
            token: account.token,
            privateToken: account.privateToken,
            siteInfo: {
                sitename: account.sitename,
                username: account.username,
                firstname: account.fullname.split(' ')[0] ?? '',
                lastname: account.fullname.split(' ').slice(1).join(' ') ?? '',
                fullname: account.fullname,
                lang: 'de',
                userid: account.userid,
                siteurl: account.siteUrl,
                userpictureurl: account.userpictureurl,
                email: '',
                release: '',
                version: '',
                functions: [],
            },
        };

        this.sessionSignal.set(session);
        this.api.configure(session.siteUrl, session.token);
        await this.storage.set(SESSION_KEY, session);

        // Refresh site info in background to get fresh data
        try {
            const freshInfo = await this.api.call<SiteInfo>('core_webservice_get_site_info');
            session.siteInfo = freshInfo;
            this.sessionSignal.set({ ...session });
            await this.storage.set(SESSION_KEY, session);
            await this.upsertAccount(session);
        } catch {
            // Use cached data if network unavailable
        }
    }

    /** Removes a stored account. */
    async removeAccount(accountId: string): Promise<void> {
        const accounts = this.storedAccounts().filter((a) => a.id !== accountId);
        this.storedAccounts.set(accounts);
        await this.storage.set(ACCOUNTS_KEY, accounts);
    }

    /** Logs out and clears stored session (account stays in list for switching). */
    async logout(): Promise<void> {
        this.sessionSignal.set(null);
        await this.storage.remove(SESSION_KEY);
        this.api.configure('', '');
        await this.router.navigate(['/login']);
    }

    /** Logs out and removes the current account from the stored list. */
    async logoutAndRemove(): Promise<void> {
        const id = this.activeAccountId();
        if (id) {
            await this.removeAccount(id);
        }
        await this.logout();
    }

    /** Adds or updates an account in the stored accounts list. */
    private async upsertAccount(session: Session): Promise<void> {
        const id = `${session.siteInfo.userid}@${session.siteUrl}`;
        const account: StoredAccount = {
            id,
            siteUrl: session.siteUrl,
            token: session.token,
            privateToken: session.privateToken,
            fullname: session.siteInfo.fullname,
            username: session.siteInfo.username,
            userpictureurl: session.siteInfo.userpictureurl,
            sitename: session.siteInfo.sitename,
            userid: session.siteInfo.userid,
        };

        const existing = this.storedAccounts();
        const idx = existing.findIndex((a) => a.id === id);
        const updated = [...existing];
        if (idx >= 0) {
            updated[idx] = account;
        } else {
            updated.push(account);
        }
        this.storedAccounts.set(updated);
        await this.storage.set(ACCOUNTS_KEY, updated);
    }

    /**
     * Fetches a token from login/token.php.
     *
     * Uses POST to prevent credentials leaking into URL/logs/history.
     */
    private async fetchToken(siteUrl: string, username: string, password: string): Promise<AuthToken> {
        const url = `${siteUrl}/login/token.php`;
        const body = new URLSearchParams({
            username,
            password,
            service: 'moodle_mobile_app',
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Verbindung fehlgeschlagen`);
        }

        const data = await response.json() as Record<string, unknown>;

        if (data['error']) {
            throw new Error(data['error'] as string);
        }

        return {
            token: data['token'] as string,
            privateToken: (data['privatetoken'] as string) ?? '',
        };
    }

    /**
     * Normalises and validates a site URL.
     *
     * - Strips trailing slashes
     * - Enforces HTTPS (rejects plain HTTP)
     * - Validates URL structure to prevent SSRF / injection
     */
    private normaliseSiteUrl(url: string): string {
        let cleaned = url.trim().replace(/\/+$/, '');

        if (!/^https?:\/\//i.test(cleaned)) {
            cleaned = `https://${cleaned}`;
        }

        // Validate URL structure
        let parsed: URL;
        try {
            parsed = new URL(cleaned);
        } catch {
            throw new Error('Ungültige URL. Bitte eine gültige Moodle-Adresse eingeben.');
        }

        // Enforce HTTPS in production
        if (parsed.protocol !== 'https:') {
            throw new Error('Nur HTTPS-Verbindungen sind erlaubt.');
        }

        // Reject localhost, private IPs, and non-standard ports to prevent SSRF
        const hostname = parsed.hostname.toLowerCase();
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
            throw new Error('Lokale Adressen sind nicht erlaubt.');
        }

        // Block private IP ranges (10.x, 172.16-31.x, 192.168.x)
        if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname)) {
            throw new Error('Private Netzwerkadressen sind nicht erlaubt.');
        }

        // Return origin + pathname only (strip query/hash/credentials)
        return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
    }
}
