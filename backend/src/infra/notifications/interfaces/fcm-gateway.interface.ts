export interface FcmMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface FcmGateway {
  readonly name: string;
  send(message: FcmMessage): Promise<{ messageId: string }>;
  sendMulticast(messages: FcmMessage[]): Promise<{ successCount: number; failureCount: number }>;
}
