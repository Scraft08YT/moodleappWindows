/** Conversation returned by core_message_get_conversations. */
export type Conversation = {
    id: number;
    name: string;
    type: ConversationType;
    memberCount: number;
    unreadCount: number;
    members: ConversationMember[];
    messages: Message[];
    imageUrl: string | null;
    /** Whether the conversation is muted. */
    isMuted: boolean;
    /** Whether the conversation is marked as favourite. */
    isFavourite: boolean;
};

export enum ConversationType {
    Individual = 1,
    Group = 2,
    Self = 3,
}

export type ConversationMember = {
    id: number;
    fullname: string;
    profileImageUrl: string;
    isOnline: boolean;
};

/** A single message within a conversation. */
export type Message = {
    id: number;
    userId: number;
    text: string;
    timeCreated: number;
    isRead: boolean;
};
