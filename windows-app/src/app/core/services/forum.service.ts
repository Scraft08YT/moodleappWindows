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
// Raw Moodle API response types — new WS (Moodle 3.8+)
// ---------------------------------------------------------------------------

type RawPostAuthor = {
    id?: number;
    fullname?: string;
    isdeleted?: boolean;
    urls?: { profileimage?: string; profile?: string };
    groups?: { id: number; name: string; urls: { image?: string } }[];
};

type RawPostCapabilities = {
    view?: boolean;
    edit?: boolean;
    delete?: boolean;
    split?: boolean;
    reply?: boolean;
    selfenrol?: boolean;
    export?: boolean;
    controlreadstatus?: boolean;
    canreplyprivately?: boolean;
};

type RawNewAttachment = {
    filename: string;
    filepath?: string;
    filesize?: number;
    mimetype?: string;
    timemodified?: number;
    fileurl?: string;
    url?: string;
    isexternalfile?: boolean;
};

/** Post shape returned by `mod_forum_get_discussion_posts` (Moodle 3.8+). */
type RawNewPost = {
    id: number;
    discussionid: number;
    parentid?: number | null;
    hasparent: boolean;
    subject: string;
    replysubject?: string;
    message: string;
    messageformat?: number;
    timecreated: number;
    timemodified?: number;
    unread?: boolean;
    isdeleted?: boolean;
    isprivatereply?: boolean;
    author: RawPostAuthor;
    capabilities: RawPostCapabilities;
    attachments?: RawNewAttachment[];
    messageinlinefiles?: RawNewAttachment[];
    tags?: unknown[];
    haswordcount?: boolean;
    wordcount?: number;
    charcount?: number;
    urls?: Record<string, string>;
};

type RawNewPostsResponse = {
    posts: RawNewPost[];
    forumid?: number;
    courseid?: number;
    warnings?: unknown[];
};

// ---------------------------------------------------------------------------
// Raw Moodle API response types — legacy WS
// ---------------------------------------------------------------------------

/** Post shape returned by `mod_forum_get_forum_discussion_posts` (legacy). */
type RawLegacyPost = {
    id: number;
    discussion: number;
    parent: number;
    userid: number;
    created: number;
    modified: number;
    subject: string;
    message: string;
    messageformat?: number;
    attachment: string | boolean;
    attachments?: RawNewAttachment[];
    canreply: boolean;
    postread?: boolean;
    userfullname: string;
    userpictureurl?: string;
    deleted?: boolean;
    isprivatereply?: boolean;
    children?: number[];
    tags?: unknown[];
};

type RawLegacyPostsResponse = {
    posts: RawLegacyPost[];
    warnings?: unknown[];
};

/**
 * Service for Moodle forum interactions.
 *
 * Supports both the new `mod_forum_get_discussion_posts` (Moodle 3.8+) and the
 * legacy `mod_forum_get_forum_discussion_posts` WS function, falling back
 * automatically when the newer endpoint is not available.
 */
@Injectable({ providedIn: 'root' })
export class ForumService {

    constructor(private readonly api: MoodleApiService) {}

    /** Fetches all forums in a course. */
    async getForum(courseId: number): Promise<Forum[]> {
        const forums = await this.api.call<Forum[]>(
            'mod_forum_get_forums_by_courses',
            { courseids: [courseId] },
        );

        // Rewrite pluginfile URLs in forum intros so embedded media loads
        for (const f of forums) {
            f.intro = this.api.rewritePluginfileUrls(f.intro ?? '');
        }

        return forums;
    }

    /**
     * Fetches discussions for a forum.
     *
     * @param forumId   The forum instance ID.
     * @param page      Page index (0-based).
     * @param perPage   Items per page.
     * @param skipCache When true, bypasses the response cache.
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

        const discussions = res.discussions ?? [];

        // Authenticate avatar and message URLs
        for (const d of discussions) {
            d.userpictureurl = this.api.getFileUrl(d.userpictureurl ?? '');
            d.message = this.api.rewritePluginfileUrls(d.message ?? '');
        }

        return discussions;
    }

    /**
     * Fetches posts of a discussion.
     *
     * Tries the new `mod_forum_get_discussion_posts` first (Moodle 3.8+).
     * Falls back to `mod_forum_get_forum_discussion_posts` (legacy) if
     * the new endpoint is unavailable or returns an error.
     *
     * Both response formats are normalised to the flat `ForumPost` type.
     *
     * @param discussionId The discussion ID.
     * @param skipCache    When true, bypasses the response cache.
     */
    async getDiscussionPosts(discussionId: number, skipCache = false): Promise<ForumPost[]> {
        try {
            return await this.getDiscussionPostsNew(discussionId, skipCache);
        } catch {
            // New WS not available — fall back to legacy
            return this.getDiscussionPostsLegacy(discussionId, skipCache);
        }
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
    async updatePost(postId: number, subject: string, message: string): Promise<boolean> {
        const res = await this.api.call<{ status: boolean; warnings?: unknown[] }>(
            'mod_forum_update_discussion_post',
            { postid: postId, subject, message },
        );
        return res.status;
    }

    /** Deletes a post. */
    async deletePost(postId: number): Promise<boolean> {
        const res = await this.api.call<{ status: boolean; warnings?: unknown[] }>(
            'mod_forum_delete_post',
            { postid: postId },
        );
        return res.status;
    }

    // ---------------------------------------------------------------------------
    // Private — new WS (Moodle 3.8+)
    // ---------------------------------------------------------------------------

    private async getDiscussionPostsNew(discussionId: number, skipCache: boolean): Promise<ForumPost[]> {
        const res = await this.api.call<RawNewPostsResponse>(
            'mod_forum_get_discussion_posts',
            { discussionid: discussionId, sortby: 'created', sortdirection: 'ASC' },
            { skipCache },
        );
        const posts = (res.posts ?? []).map((raw) => this.mapNewPost(raw));
        return this.buildPostTree(posts);
    }

    /** Maps the new-format post to the normalised `ForumPost` shape. */
    private mapNewPost(raw: RawNewPost): ForumPost {
        const parentId = raw.parentid ?? 0;
        const fullname = raw.author?.fullname ?? '';
        const pictureUrl = raw.author?.urls?.profileimage ?? '';
        const userId = raw.author?.id ?? 0;

        const attachments = this.normaliseAttachments(raw.attachments);

        return {
            id: raw.id,
            discussionid: raw.discussionid,
            parentid: parentId,
            subject: raw.subject ?? '',
            message: this.api.rewritePluginfileUrls(raw.message ?? ''),
            timecreated: raw.timecreated,
            timemodified: raw.timemodified ?? raw.timecreated,
            userfullname: fullname,
            userpictureurl: this.api.getFileUrl(pictureUrl),
            userid: userId,
            attachment: attachments.length > 0,
            attachments,
            children: [],
            canEdit: raw.capabilities?.edit ?? false,
            canDelete: raw.capabilities?.delete ?? false,
            canReply: raw.capabilities?.reply ?? true,
        };
    }

    // ---------------------------------------------------------------------------
    // Private — legacy WS
    // ---------------------------------------------------------------------------

    private async getDiscussionPostsLegacy(discussionId: number, skipCache: boolean): Promise<ForumPost[]> {
        const res = await this.api.call<RawLegacyPostsResponse>(
            'mod_forum_get_forum_discussion_posts',
            { discussionid: discussionId, sortby: 'created', sortdirection: 'ASC' },
            { skipCache },
        );
        const posts = (res.posts ?? []).map((raw) => this.mapLegacyPost(raw));
        return this.buildPostTree(posts);
    }

    /** Maps the legacy-format post to the normalised `ForumPost` shape. */
    private mapLegacyPost(raw: RawLegacyPost): ForumPost {
        const attachments = this.normaliseAttachments(raw.attachments);

        return {
            id: raw.id,
            discussionid: raw.discussion,
            parentid: raw.parent ?? 0,
            subject: raw.subject ?? '',
            message: this.api.rewritePluginfileUrls(raw.message ?? ''),
            timecreated: raw.created,
            timemodified: raw.modified ?? raw.created,
            userfullname: raw.userfullname ?? '',
            userpictureurl: this.api.getFileUrl(raw.userpictureurl ?? ''),
            userid: raw.userid ?? 0,
            attachment: attachments.length > 0 || !!raw.attachment,
            attachments,
            children: [],
            canEdit: false,   // Legacy WS does not expose edit capability
            canDelete: false,  // Legacy WS does not expose delete capability
            canReply: !!raw.canreply,
        };
    }

    // ---------------------------------------------------------------------------
    // Shared helpers
    // ---------------------------------------------------------------------------

    /** Normalises attachments from either API format. */
    private normaliseAttachments(raw?: RawNewAttachment[]): ForumAttachment[] {
        return (raw ?? []).map((a) => ({
            filename: a.filename,
            filepath: a.filepath ?? '/',
            fileurl: this.api.getFileUrl(a.fileurl ?? a.url ?? ''),
            filesize: a.filesize ?? 0,
            mimetype: a.mimetype ?? '',
        }));
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
