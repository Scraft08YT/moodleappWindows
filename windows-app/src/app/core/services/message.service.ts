import { Injectable, signal } from '@angular/core';

import { MoodleApiService } from './moodle-api.service';
import type { Conversation, Message, ConversationMember } from '../models/message.model';
import { ConversationType } from '../models/message.model';

/**
 * Service for Moodle messaging.
 *
 * Uses `core_message_get_conversations` and `core_message_send_instant_messages`.
 */
@Injectable({ providedIn: 'root' })
export class MessageService {

    readonly conversations = signal<Conversation[]>([]);
    readonly loading = signal(false);
    readonly totalUnread = signal(0);

    constructor(private readonly api: MoodleApiService) {}

    /** Loads all conversations for the current user. */
    async loadConversations(userId: number): Promise<void> {
        this.loading.set(true);
        try {
            const result = await this.api.call<RawConversationsResponse>(
                'core_message_get_conversations',
                {
                    userid: userId,
                    type: 0, // all types
                    limitnum: 50,
                },
            );

            const mapped: Conversation[] = (result.conversations ?? []).map((c) => ({
                id: c.id,
                name: c.name ?? this.buildConversationName(c.members ?? []),
                type: c.type as ConversationType,
                memberCount: c.membercount,
                unreadCount: c.unreadcount ?? 0,
                imageUrl: c.imageurl ?? null,
                isMuted: c.ismuted ?? false,
                isFavourite: c.isfavourite ?? false,
                members: (c.members ?? []).map((m) => ({
                    id: m.id,
                    fullname: m.fullname,
                    profileImageUrl: m.profileimageurl ?? '',
                    isOnline: m.isonline ?? false,
                })),
                messages: (c.messages ?? []).map((msg) => ({
                    id: msg.id,
                    userId: msg.useridfrom,
                    text: msg.text,
                    timeCreated: msg.timecreated,
                    isRead: msg.isread,
                })),
            }));

            this.conversations.set(mapped);
            this.totalUnread.set(mapped.reduce((sum, c) => sum + c.unreadCount, 0));
        } finally {
            this.loading.set(false);
        }
    }

    /** Sends a message in a conversation. */
    async sendMessage(conversationId: number, text: string): Promise<void> {
        await this.api.call('core_message_send_messages_to_conversation', {
            conversationid: conversationId,
            messages: [{ text }],
        });
    }

    /** Fetches messages for a specific conversation. */
    async getMessages(conversationId: number, userId: number): Promise<Message[]> {
        const result = await this.api.call<RawMessagesResponse>(
            'core_message_get_conversation_messages',
            {
                currentuserid: userId,
                convid: conversationId,
                newest: 1,
                limitnum: 100,
            },
        );

        return (result.messages ?? []).map((msg) => ({
            id: msg.id,
            userId: msg.useridfrom,
            text: msg.text,
            timeCreated: msg.timecreated,
            isRead: msg.isread,
        }));
    }

    /**
     * Searches for users to start a new conversation with.
     * Uses `core_message_search_contacts` and `core_message_message_search_users`.
     */
    async searchUsers(query: string): Promise<UserSearchResult[]> {
        try {
            const result = await this.api.call<RawUserSearchResponse>(
                'core_message_search_contacts',
                { searchtext: query, onlycontacts: 0 },
            );

            return (result ?? []).map((u) => ({
                id: u.id,
                fullname: u.fullname,
                profileImageUrl: u.profileimageurl ?? '',
            }));
        } catch {
            // Fallback to message_search_users if available
            try {
                const altResult = await this.api.call<{ contacts: RawSearchUser[] }>(
                    'core_message_message_search_users',
                    { search: query, limitnum: 20 },
                );

                return (altResult.contacts ?? []).map((u) => ({
                    id: u.id,
                    fullname: u.fullname,
                    profileImageUrl: u.profileimageurl ?? '',
                }));
            } catch {
                return [];
            }
        }
    }

    /**
     * Sends a direct message to a user (without needing a conversation ID).
     * Uses `core_message_send_instant_messages`.
     */
    async sendDirectMessage(toUserId: number, text: string): Promise<void> {
        await this.api.call('core_message_send_instant_messages', {
            messages: [{
                touserid: toUserId,
                text,
                textformat: 1,
            }],
        });
    }

    /**
     * Gets (or creates) the conversation ID between the current user and another user.
     * Uses `core_message_get_conversation_between_users`.
     */
    async getConversationBetweenUsers(userId: number, otherUserId: number): Promise<number | null> {
        try {
            const result = await this.api.call<{ id: number }>(
                'core_message_get_conversation_between_users',
                {
                    userid: userId,
                    otheruserid: otherUserId,
                    includecontactrequests: 0,
                    includeprivacyinfo: 0,
                },
            );
            return result.id ?? null;
        } catch {
            return null;
        }
    }

    /** Builds a conversation name from member names (for individual chats). */
    private buildConversationName(members: RawMember[]): string {
        return members.map((m) => m.fullname).join(', ') || 'Conversation';
    }
}

// Raw Moodle response types
type RawConversationsResponse = {
    conversations: RawConversation[];
};

type RawConversation = {
    id: number;
    name?: string;
    type: number;
    membercount: number;
    unreadcount?: number;
    imageurl?: string;
    ismuted?: boolean;
    isfavourite?: boolean;
    members?: RawMember[];
    messages?: RawMessage[];
};

type RawMember = {
    id: number;
    fullname: string;
    profileimageurl?: string;
    isonline?: boolean;
};

type RawMessage = {
    id: number;
    useridfrom: number;
    text: string;
    timecreated: number;
    isread: boolean;
};

type RawMessagesResponse = {
    messages: RawMessage[];
};

/** User search result (exposed to components). */
export type UserSearchResult = {
    id: number;
    fullname: string;
    profileImageUrl: string;
};

type RawUserSearchResponse = RawSearchUser[];

type RawSearchUser = {
    id: number;
    fullname: string;
    profileimageurl?: string;
};
