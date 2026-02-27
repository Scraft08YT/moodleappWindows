import { Component, inject, signal, computed, type OnInit, ViewChild, type ElementRef, type AfterViewChecked } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../core/services/auth.service';
import { MessageService, type UserSearchResult } from '../../core/services/message.service';
import type { Conversation, Message } from '../../core/models/message.model';
import { SafeHtmlPipe } from '../../shared/pipes/safe-html.pipe';

/**
 * Messages page – split-view with conversation list and message detail.
 */
@Component({
    selector: 'app-messages',
    standalone: true,
    imports: [FormsModule, SafeHtmlPipe],
    templateUrl: './messages.component.html',
    styleUrl: './messages.component.scss',
})
export class MessagesComponent implements OnInit, AfterViewChecked {

    private readonly auth = inject(AuthService);
    private readonly messageService = inject(MessageService);

    readonly loading = this.messageService.loading;
    readonly conversations = this.messageService.conversations;
    readonly selectedConversation = signal<Conversation | null>(null);
    readonly messages = signal<Message[]>([]);
    readonly messageText = signal('');
    readonly messagesLoading = signal(false);
    readonly searchQuery = signal('');

    // New chat state
    readonly showNewChat = signal(false);
    readonly userSearchQuery = signal('');
    readonly userSearchResults = signal<UserSearchResult[]>([]);
    readonly userSearchLoading = signal(false);
    readonly sendingNewMessage = signal(false);
    readonly newChatText = signal('');
    readonly selectedUser = signal<UserSearchResult | null>(null);
    readonly newChatError = signal('');

    // Scroll tracking
    private shouldScrollToBottom = false;

    readonly filteredConversations = computed(() => {
        const query = this.searchQuery().toLowerCase().trim();
        if (!query) return this.conversations();
        return this.conversations().filter((c) =>
            c.name.toLowerCase().includes(query),
        );
    });

    readonly currentUserId = computed(() =>
        this.auth.session()?.siteInfo.userid ?? 0,
    );

    async ngOnInit(): Promise<void> {
        const userId = this.auth.session()?.siteInfo.userid;
        if (userId) {
            await this.messageService.loadConversations(userId);
        }
    }

    ngAfterViewChecked(): void {
        if (this.shouldScrollToBottom) {
            this.scrollMessagesToBottom();
            this.shouldScrollToBottom = false;
        }
    }

    async selectConversation(conversation: Conversation): Promise<void> {
        this.selectedConversation.set(conversation);
        this.showNewChat.set(false);
        this.messagesLoading.set(true);
        try {
            const msgs = await this.messageService.getMessages(
                conversation.id,
                this.currentUserId(),
            );
            this.messages.set(msgs);
            this.shouldScrollToBottom = true;
        } finally {
            this.messagesLoading.set(false);
        }
    }

    async sendMessage(): Promise<void> {
        const conv = this.selectedConversation();
        const text = this.messageText().trim();
        if (!conv || !text) return;

        await this.messageService.sendMessage(conv.id, text);
        this.messageText.set('');

        // Refresh messages
        const msgs = await this.messageService.getMessages(
            conv.id,
            this.currentUserId(),
        );
        this.messages.set(msgs);
        this.shouldScrollToBottom = true;
    }

    // ========== New Chat ==========

    openNewChat(): void {
        this.showNewChat.set(true);
        this.selectedConversation.set(null);
        this.selectedUser.set(null);
        this.userSearchQuery.set('');
        this.userSearchResults.set([]);
        this.newChatText.set('');
        this.newChatError.set('');
    }

    closeNewChat(): void {
        this.showNewChat.set(false);
        this.selectedUser.set(null);
    }

    private searchTimeout: ReturnType<typeof setTimeout> | null = null;

    onUserSearchInput(query: string): void {
        this.userSearchQuery.set(query);

        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        const trimmed = query.trim();
        if (trimmed.length < 2) {
            this.userSearchResults.set([]);
            return;
        }

        this.searchTimeout = setTimeout(() => {
            void this.performUserSearch(trimmed);
        }, 300);
    }

    private async performUserSearch(query: string): Promise<void> {
        this.userSearchLoading.set(true);
        try {
            const results = await this.messageService.searchUsers(query);
            // Filter out self
            this.userSearchResults.set(
                results.filter((u) => u.id !== this.currentUserId()),
            );
        } catch (err) {
            console.error('User search failed:', err);
            this.userSearchResults.set([]);
        } finally {
            this.userSearchLoading.set(false);
        }
    }

    selectUserForChat(user: UserSearchResult): void {
        this.selectedUser.set(user);
        this.newChatError.set('');
    }

    async sendNewMessage(): Promise<void> {
        const user = this.selectedUser();
        const text = this.newChatText().trim();
        if (!user || !text) return;

        this.sendingNewMessage.set(true);
        this.newChatError.set('');

        try {
            await this.messageService.sendDirectMessage(user.id, text);

            // Reload conversations to get the new one
            await this.messageService.loadConversations(this.currentUserId());

            // Try to find and select the new conversation
            const convId = await this.messageService.getConversationBetweenUsers(
                this.currentUserId(),
                user.id,
            );

            if (convId) {
                const conv = this.conversations().find((c) => c.id === convId);
                if (conv) {
                    await this.selectConversation(conv);
                }
            }

            this.showNewChat.set(false);
            this.newChatText.set('');
            this.selectedUser.set(null);
        } catch (err) {
            console.error('Failed to send message:', err);
            this.newChatError.set('Nachricht konnte nicht gesendet werden. Bitte erneut versuchen.');
        } finally {
            this.sendingNewMessage.set(false);
        }
    }

    // ========== Helpers ==========

    getConversationAvatar(conv: Conversation): string {
        return conv.imageUrl ?? conv.members[0]?.profileImageUrl ?? '';
    }

    getConversationInitials(conv: Conversation): string {
        const name = conv.name || conv.members[0]?.fullname || '?';
        const parts = name.split(' ').filter(Boolean);
        if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        return name.substring(0, 2).toUpperCase();
    }

    getUserInitials(name: string): string {
        const parts = name.split(' ').filter(Boolean);
        if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        return name.substring(0, 2).toUpperCase();
    }

    formatTime(timestamp: number): string {
        const date = new Date(timestamp * 1000);
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        if (diff < 86400000) {
            return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        }
        if (diff < 604800000) {
            return date.toLocaleDateString('de-DE', { weekday: 'short' });
        }
        return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    }

    private scrollMessagesToBottom(): void {
        const container = document.querySelector('.messages-page__messages');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }
}
