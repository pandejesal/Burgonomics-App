export interface SmsGateway {
  readonly name: string;
  send(input: { to: string; message: string }): Promise<{ messageId: string }>;
}
