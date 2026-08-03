import { Injectable } from '@nestjs/common';
import { MessagingProvider } from './messaging.provider';

/**
 * Topic subscription lifecycle. Wraps `MessagingProvider` so that any
 * downstream feature module (offers, broadcast campaigns) can manage
 * device-to-topic membership without touching firebase-admin.
 */
@Injectable()
export class TopicProvider {
  constructor(private readonly messaging: MessagingProvider) {}

  subscribe(tokens: string[], topic: string): Promise<void> {
    return this.messaging.subscribeToTopic(tokens, topic);
  }

  unsubscribe(tokens: string[], topic: string): Promise<void> {
    return this.messaging.unsubscribeFromTopic(tokens, topic);
  }

  broadcast(
    topic: string,
    payload: { title: string; body: string; data?: Record<string, string>; imageUrl?: string },
  ) {
    return this.messaging.sendToTopic(topic, payload);
  }
}
