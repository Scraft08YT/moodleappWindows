import { Injectable, signal, computed } from '@angular/core';

import { StorageService } from './storage.service';

const CACHE_PREFIX = 'offline_cache::';
const CACHE_INDEX_KEY = 'offline_cache_index';

/** One hour default TTL. */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

/** Maximum number of cached entries before LRU eviction kicks in. */
const MAX_CACHE_ENTRIES = 200;

export type CachedEntry = {
    key: string;
    data: unknown;
    timestamp: number;
    ttl: number;
    wsFunction: string;
};

type CacheIndex = {
    keys: string[];
    totalSize: number;
    lastUpdated: number;
};

/**
 * Caches Moodle API responses for offline access.
 *
 * - Write-through: every successful API call is cached.
 * - Cache-first when offline: returns cached data if available.
 * - Configurable TTL per WS function.
 * - LRU eviction when cache exceeds MAX_CACHE_ENTRIES.
 */
@Injectable({ providedIn: 'root' })
export class OfflineCacheService {

    private readonly onlineSignal = signal(navigator.onLine);

    /** Whether the device has network connectivity. */
    readonly isOnline = this.onlineSignal.asReadonly();

    /** Inverse for template convenience. */
    readonly isOffline = computed(() => !this.onlineSignal());

    /** Per-function TTL overrides (ms). */
    private readonly ttlMap: Record<string, number> = {
        'core_enrol_get_users_courses': 30 * 60 * 1000,     // 30 min
        'core_course_get_contents': 30 * 60 * 1000,          // 30 min
        'core_webservice_get_site_info': 24 * 60 * 60 * 1000, // 24 h
        'gradereport_overview_get_course_grades': 15 * 60 * 1000,
        'core_calendar_get_calendar_monthly_view': 15 * 60 * 1000,
        'message_popup_get_popup_notifications': 5 * 60 * 1000,
        'core_message_get_conversations': 5 * 60 * 1000,
        'core_user_get_users_by_field': 60 * 60 * 1000,
        'core_files_get_files': 30 * 60 * 1000,
        'mod_forum_get_forums_by_courses': 5 * 60 * 1000,    // 5 min
        'mod_forum_get_forum_discussions': 2 * 60 * 1000,    // 2 min – discussions change frequently
        'mod_forum_get_discussion_posts': 60 * 1000,         // 1 min – posts change frequently
        'mod_forum_get_forum_discussion_posts': 60 * 1000,   // 1 min – legacy posts endpoint
        'mod_quiz_get_quizzes_by_courses': 10 * 60 * 1000,   // 10 min – quiz metadata rarely changes
        'mod_quiz_get_quiz_access_information': 5 * 60 * 1000, // 5 min
        'mod_quiz_get_user_attempts': 60 * 1000,             // 1 min – attempts change during quiz
        'mod_quiz_get_user_quiz_attempts': 60 * 1000,        // 1 min
        'mod_quiz_get_user_best_grade': 2 * 60 * 1000,       // 2 min
        'core_comment_get_comments': 2 * 60 * 1000,          // 2 min – submission comments
    };

    constructor(private readonly storage: StorageService) {
        window.addEventListener('online', () => this.onlineSignal.set(true));
        window.addEventListener('offline', () => this.onlineSignal.set(false));
    }

    /** Generates a cache key from function name + params. */
    private buildKey(wsFunction: string, params: Record<string, unknown>): string {
        const paramStr = JSON.stringify(params, Object.keys(params).sort());
        return `${CACHE_PREFIX}${wsFunction}::${paramStr}`;
    }

    /** Stores an API response in the cache, evicting oldest entries if needed. */
    async put(wsFunction: string, params: Record<string, unknown>, data: unknown): Promise<void> {
        const key = this.buildKey(wsFunction, params);
        const ttl = this.ttlMap[wsFunction] ?? DEFAULT_TTL_MS;

        const entry: CachedEntry = {
            key,
            data,
            timestamp: Date.now(),
            ttl,
            wsFunction,
        };

        await this.storage.set(key, entry);
        await this.updateIndex(key);
        await this.evictIfNeeded();
    }

    /** Retrieves a cached response if it exists and is not expired. */
    async get<T>(wsFunction: string, params: Record<string, unknown>): Promise<T | null> {
        const key = this.buildKey(wsFunction, params);
        const entry = await this.storage.get<CachedEntry>(key);

        if (!entry) return null;

        // If online, check TTL strictly
        if (this.isOnline()) {
            const age = Date.now() - entry.timestamp;
            if (age > entry.ttl) return null;
        }

        // If offline, return even expired data (better than nothing)
        return entry.data as T;
    }

    /** Retrieves cached data regardless of TTL (for offline fallback). */
    async getStale<T>(wsFunction: string, params: Record<string, unknown>): Promise<T | null> {
        const key = this.buildKey(wsFunction, params);
        const entry = await this.storage.get<CachedEntry>(key);
        return entry ? (entry.data as T) : null;
    }

    /** Clears all cached API responses. */
    async clearAll(): Promise<void> {
        const index = await this.storage.get<CacheIndex>(CACHE_INDEX_KEY);
        if (index) {
            await Promise.all(index.keys.map((key) => this.storage.remove(key)));
        }
        await this.storage.remove(CACHE_INDEX_KEY);
    }

    /** Returns the number of cached entries. */
    async getCacheSize(): Promise<number> {
        const index = await this.storage.get<CacheIndex>(CACHE_INDEX_KEY);
        return index?.keys.length ?? 0;
    }

    /** Updates the cache index with a new key (moves to end for LRU). */
    private async updateIndex(key: string): Promise<void> {
        const index = await this.storage.get<CacheIndex>(CACHE_INDEX_KEY) ?? {
            keys: [],
            totalSize: 0,
            lastUpdated: 0,
        };

        // Move key to end (most recently used)
        const filtered = index.keys.filter((k) => k !== key);
        filtered.push(key);
        index.keys = filtered;
        index.lastUpdated = Date.now();

        await this.storage.set(CACHE_INDEX_KEY, index);
    }

    /** Evicts the oldest cache entries when exceeding the limit. */
    private async evictIfNeeded(): Promise<void> {
        const index = await this.storage.get<CacheIndex>(CACHE_INDEX_KEY);
        if (!index || index.keys.length <= MAX_CACHE_ENTRIES) return;

        // Remove oldest entries (front of the array)
        const toRemove = index.keys.splice(0, index.keys.length - MAX_CACHE_ENTRIES);
        await Promise.all(toRemove.map((key) => this.storage.remove(key)));

        index.lastUpdated = Date.now();
        await this.storage.set(CACHE_INDEX_KEY, index);
    }
}
