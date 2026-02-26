import { Injectable } from '@angular/core';

/**
 * Persistent key-value storage backed by Tauri's store plugin
 * with a localStorage fallback for browser dev mode.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {

    private store: TauriStore | null = null;
    private initPromise: Promise<void> | null = null;

    /** Lazily initialises the Tauri store (or falls back to localStorage). */
    private async init(): Promise<void> {
        if (this.initPromise) {
            return this.initPromise;
        }
        this.initPromise = this.doInit();
        return this.initPromise;
    }

    private async doInit(): Promise<void> {
        try {
            const { Store } = await import('@tauri-apps/plugin-store');
            this.store = await Store.load('moodle-desktop-store.json') as unknown as TauriStore;
        } catch {
            // Running in browser dev mode – use localStorage wrapper
            this.store = null;
        }
    }

    /** Retrieves a value by key. */
    async get<T>(key: string): Promise<T | null> {
        await this.init();
        if (this.store) {
            return (await this.store.get(key)) as T | null;
        }
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
    }

    /** Stores a value under the given key. */
    async set<T>(key: string, value: T): Promise<void> {
        await this.init();
        if (this.store) {
            await this.store.set(key, value);
            await this.store.save();
        } else {
            localStorage.setItem(key, JSON.stringify(value));
        }
    }

    /** Removes a value by key. */
    async remove(key: string): Promise<void> {
        await this.init();
        if (this.store) {
            await this.store.delete(key);
            await this.store.save();
        } else {
            localStorage.removeItem(key);
        }
    }

    /** Clears all stored data. */
    async clear(): Promise<void> {
        await this.init();
        if (this.store) {
            await this.store.clear();
            await this.store.save();
        } else {
            localStorage.clear();
        }
    }
}

/** Minimal Tauri Store interface for type safety. */
type TauriStore = {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    save(): Promise<void>;
};
