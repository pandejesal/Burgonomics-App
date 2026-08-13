declare module "@capacitor/push-notifications" {
  export interface PermissionStatus {
    receive: "prompt" | "prompt-with-rationale" | "granted" | "denied";
  }

  export interface Token {
    value: string;
  }

  export interface PushNotificationSchema {
    title?: string;
    subtitle?: string;
    body?: string;
    id: string;
    badge?: number;
    notification?: any;
    data: any;
    click_action?: string;
    link?: string;
    group?: string;
    groupSummary?: boolean;
  }

  export interface ActionPerformed {
    actionId: string;
    inputValue?: string;
    notification: PushNotificationSchema;
  }

  export interface PushNotificationsPlugin {
    register(): Promise<void>;
    unregister?(): Promise<void>;
    getDeliveredNotifications?(): Promise<{ notifications: PushNotificationSchema[] }>;
    removeDeliveredNotifications?(options: { notifications: PushNotificationSchema[] }): Promise<void>;
    removeAllDeliveredNotifications?(): Promise<void>;
    createChannel?(channel: any): Promise<void>;
    deleteChannel?(options: { id: string }): Promise<void>;
    listChannels?(): Promise<{ channels: any[] }>;
    checkPermissions(): Promise<PermissionStatus>;
    requestPermissions(): Promise<PermissionStatus>;
    addListener(
      eventName: "registration",
      listenerFunc: (token: Token) => void,
    ): Promise<any>;
    addListener(
      eventName: "registrationError",
      listenerFunc: (error: any) => void,
    ): Promise<any>;
    addListener(
      eventName: "pushNotificationReceived",
      listenerFunc: (notification: PushNotificationSchema) => void,
    ): Promise<any>;
    addListener(
      eventName: "pushNotificationActionPerformed",
      listenerFunc: (action: ActionPerformed) => void,
    ): Promise<any>;
    removeAllListeners(): Promise<void>;
  }

  export const PushNotifications: PushNotificationsPlugin;
}
