import { Injectable } from '@angular/core';

import { MoodleApiService } from './moodle-api.service';

/** Forum discussion summary. */
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

/** A single forum post. */
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

    /** Fetches discussions for a forum. */
    async getDiscussions(forumId: number, page = 0, perPage = 25): Promise<ForumDiscussion[]> {
        const res = await this.api.call<{ discussions: ForumDiscussion[] }>(
            'mod_forum_get_forum_discussions',
            { forumid: forumId, sortorder: 4, page, perpage: perPage },
        );
        return res.discussions ?? [];
    }

    /** Fetches posts of a discussion. */
    async getDiscussionPosts(discussionId: number): Promise<ForumPost[]> {
        const res = await this.api.call<{ posts: ForumPost[] }>(
            'mod_forum_get_discussion_posts',
            { discussionid: discussionId, sortby: 'created', sortdirection: 'ASC' },
        );
        return this.buildPostTree(res.posts ?? []);
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
