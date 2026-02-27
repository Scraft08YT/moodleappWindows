import { Injectable } from '@angular/core';

import { MoodleApiService } from './moodle-api.service';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Forum discussion summary returned by `mod_forum_get_forum_discussions`. */
export type ForumDiscussion = {
    id: number;
    name: string;
    subject: string;
    message: string;
    timemodified: number;
    created: number;
    userfullname: string;
    userpictureurl: string;
    userid: number;
    numreplies: number;
    pinned: boolean;
};

/** Normalised forum post used by the UI. */
export type ForumPost = {
    id: number;
    discussionid: number;
    parentid: number;
    subject: string;
    message: string;
    timecreated: number;
    timemodified: number;
    userfullname: string;
    userpictureurl: string;
    userid: number;
    attachment: boolean;
    attachments: ForumAttachment[];
    children: ForumPost[];
    canEdit: boolean;
    canDelete: boolean;
    canReply: boolean;
};

export type ForumAttachment = {
    filename: string;
    filepath: string;
    fileurl: string;
    filesize: number;
    mimetype: string;
};

/** Forum instance. */
export type Forum = {
    id: number;
    course: number;
    name: string;
    intro: string;
    introformat: number;
    type: string;
};

// ---------------------------------------------------------------------------
// Raw Moodle API response types for mod_forum_get_discussion_posts (3.8+)
// ---------------------------------------------------------------------------

type RawPostAuthor = {
    id: number;
    fullname: string;
    urls?: { profileimage?: string; profile?: string };
};

type RawPostCapabilities = {
    view?: boolean;
    edit?: boolean;
    delete?: boolean;
    reply?: boolean;
};

type RawAttachment = {
    filename: string;
    filepath?: string;
    filesize?: number;
    mimetype?: string;
    url?: string;
    fileurl?: string;
};

type RawPost = {
    id: number;
    discussionid: number;
    parentid?: number | null;
    parent?: number;
    subject: string;
    message: string;
    timecreated: number;
    timemodified: number;
    author?: RawPostAuthor;
    userfullname?: string;
    userpictureurl?: string;
    userid?: number;
    attachment?: boolean | string;
    attachments?: RawAttachment[];
    capabilities?: RawPostCapabilities;
    children?: RawPost[];
};

type RawDiscussionPostsResponse = {
    posts: RawPost[];
};

/**
 * Service for Moodle forum interactions.
 */
@Injectable({ providedIn: 'root' })
export class ForumService {

    constructor(private readonly api: MoodleApiService) {}

    /** Fetches forum info by course module instance ID. */
    async getForum(courseId: number): Promise<Forum[]> {
        return this.api.call<Forum[]>(
            'mod_forum_get_forums_by_courses',
            { courseids: [courseId] },
        );
    }

    /**
     * Fetches discussions for a forum.
     *
     * @param forumId   The forum instance ID.
     * @param page      Page index (0-based).
     * @param perPage   Items per page.
     * @param skipCache When true, bypasses the response cache and fetches fresh data from the network.
     */
    async getDiscussions(
        forumId: number,
        page = 0,
        perPage = 25,
        skipCache = false,
    ): Promise<ForumDiscussion[]> {
        const res = await this.api.call<{ discussions: ForumDiscussion[] }>(
            'mod_forum_get_forum_discussions',
            { forumid: forumId, sortorder: 4, page, perpage: perPage },
            { skipCache },
        );
        return res.discussions ?? [];
    }

    /**
     * Fetches posts of a discussion.
     *
     * Maps the raw Moodle 3.8+ response format (nested `author` object,
     * nullable `parentid`, `capabilities`) to the flat `ForumPost` type
     * used by the UI.
     *
     * @param discussionId The discussion ID.
     * @param skipCache    When true, bypasses the response cache.
     */
    async getDiscussionPosts(discussionId: number, skipCache = false): Promise<ForumPost[]> {
        const res = await this.api.call<RawDiscussionPostsResponse>(
            'mod_forum_get_discussion_posts',
            { discussionid: discussionId, sortby: 'created', sortdirection: 'ASC' },
            { skipCache },
        );
        const normalised = (res.posts ?? []).map((raw) => this.mapRawPost(raw));
        return this.buildPostTree(normalised);
    }

    /** Adds a reply to a discussion. */
    async addReply(postId: number, subject: string, message: string): Promise<{ postid: number }> {
        return this.api.call<{ postid: number }>(
            'mod_forum_add_discussion_post',
            { postid: postId, subject, message },
        );
    }

    /** Creates a new discussion in a forum. */
    async addDiscussion(forumId: number, subject: string, message: string): Promise<{ discussionid: number }> {
        return this.api.call<{ discussionid: number }>(
            'mod_forum_add_discussion',
            { forumid: forumId, subject, message },
        );
    }

    /** Updates an existing post's subject and message. */
    async updatePost(postId: number, subject: string, message: string): Promise<unknown> {
        return this.api.call(
            'mod_forum_update_discussion_post',
            { postid: postId, subject, message },
        );
    }

    /** Deletes a post. */
    async deletePost(postId: number): Promise<unknown> {
        return this.api.call(
            'mod_forum_delete_post',
            { postid: postId },
        );
    }

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    /**
     * Maps a raw Moodle post (3.8+ format or legacy) to the normalised `ForumPost` shape.
     *
     * The newer API nests user info inside `author` and provides `capabilities`.
     * The legacy API uses flat `userfullname` / `userpictureurl` fields.
     */
    private mapRawPost(raw: RawPost): ForumPost {
        const parentId = raw.parentid ?? raw.parent ?? 0;

        // Author fields – prefer nested `author` object, fall back to flat fields
        const fullname = raw.author?.fullname ?? raw.userfullname ?? '';
        const pictureUrl = raw.author?.urls?.profileimage ?? raw.userpictureurl ?? '';
        const userId = raw.author?.id ?? raw.userid ?? 0;

        // Attachments – normalise `url` vs `fileurl`
        const attachments: ForumAttachment[] = (raw.attachments ?? []).map((a) => ({
            filename: a.filename,
            filepath: a.filepath ?? '/',
            fileurl: a.url ?? a.fileurl ?? '',
            filesize: a.filesize ?? 0,
            mimetype: a.mimetype ?? '',
        }));

        return {
            id: raw.id,
            discussionid: raw.discussionid,
            parentid: parentId,
            subject: raw.subject ?? '',
            message: raw.message ?? '',
            timecreated: raw.timecreated,
            timemodified: raw.timemodified,
            userfullname: fullname,
            userpictureurl: pictureUrl,
            userid: userId,
            attachment: attachments.length > 0 || !!raw.attachment,
            attachments,
            children: [],
            canEdit: raw.capabilities?.edit ?? false,
            canDelete: raw.capabilities?.delete ?? false,
            canReply: raw.capabilities?.reply ?? true,
        };
    }

    /** Builds a tree of posts from a flat array using parentid. */
    private buildPostTree(posts: ForumPost[]): ForumPost[] {
        const map = new Map<number, ForumPost>();
        const roots: ForumPost[] = [];

        for (const post of posts) {
            post.children = [];
            map.set(post.id, post);
        }

        for (const post of posts) {
            if (post.parentid && map.has(post.parentid)) {
                map.get(post.parentid)!.children.push(post);
            } else {
                roots.push(post);
            }
        }

        return roots;
    }
}
