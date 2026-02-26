import { Injectable } from '@angular/core';

import { MoodleApiService } from './moodle-api.service';
import type { UserProfile } from '../models/profile.model';

/**
 * Service for fetching user profile data from Moodle.
 */
@Injectable({ providedIn: 'root' })
export class UserProfileService {

    constructor(private readonly api: MoodleApiService) {}

    /** Fetches a user's full profile by user ID. */
    async getUserProfile(userId: number): Promise<UserProfile> {
        const raw = await this.api.call<RawUser[]>(
            'core_user_get_users_by_field',
            { field: 'id', values: [userId] },
        );

        if (!raw.length) {
            throw new Error(`User ${userId} not found`);
        }

        const u = raw[0];

        return {
            id: u.id,
            username: u.username ?? '',
            fullname: u.fullname ?? '',
            firstname: u.firstname ?? '',
            lastname: u.lastname ?? '',
            email: u.email ?? '',
            profileimageurl: u.profileimageurl ?? '',
            profileimageurlsmall: u.profileimageurlsmall ?? '',
            city: u.city ?? '',
            country: u.country ?? '',
            description: u.description ?? '',
            descriptionformat: u.descriptionformat ?? 1,
            firstaccess: u.firstaccess ?? 0,
            lastaccess: u.lastaccess ?? 0,
            department: u.department ?? '',
            institution: u.institution ?? '',
            interests: u.interests ?? '',
            url: u.url ?? '',
            customfields: (u.customfields ?? []).map((cf) => ({
                type: cf.type ?? '',
                value: cf.value ?? '',
                name: cf.name ?? '',
                shortname: cf.shortname ?? '',
            })),
            roles: (u.roles ?? []).map((r) => ({
                roleid: r.roleid,
                name: r.name ?? '',
                shortname: r.shortname ?? '',
            })),
            enrolledcourses: (u.enrolledcourses ?? []).map((c) => ({
                id: c.id,
                fullname: c.fullname ?? '',
                shortname: c.shortname ?? '',
            })),
        };
    }

    /** Fetches the current user's own profile. */
    async getOwnProfile(userId: number): Promise<UserProfile> {
        return this.getUserProfile(userId);
    }
}

type RawUser = Record<string, unknown> & {
    id: number;
    username?: string;
    fullname?: string;
    firstname?: string;
    lastname?: string;
    email?: string;
    profileimageurl?: string;
    profileimageurlsmall?: string;
    city?: string;
    country?: string;
    description?: string;
    descriptionformat?: number;
    firstaccess?: number;
    lastaccess?: number;
    department?: string;
    institution?: string;
    interests?: string;
    url?: string;
    customfields?: { type: string; value: string; name: string; shortname: string }[];
    roles?: { roleid: number; name: string; shortname: string }[];
    enrolledcourses?: { id: number; fullname: string; shortname: string }[];
};
