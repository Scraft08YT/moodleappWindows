/** Notification returned by message_popup_get_popup_notifications. */
export type AppNotification = {
    id: number;
    userId: number;
    subject: string;
    fullMessage: string;
    fullMessageHtml: string;
    smallMessage: string;
    component: string;
    eventType: string;
    contextUrl: string;
    contextUrlName: string;
    timeCreated: number;
    read: boolean;
    iconUrl: string;
};
