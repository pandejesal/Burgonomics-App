import { Injectable, Logger } from '@nestjs/common';
import {
  MessagingProvider,
  type FcmMulticastResult,
  type FcmSendResult,
} from '../providers/messaging.provider';
import { TopicProvider } from '../providers/topic.provider';

/**
 * High-level Firebase facade consumed by the Notifications domain.
 * Wraps the low-level providers with domain-friendly methods for
 * single-device, multi-device, and topic sends.
 */
@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);

  constructor(
    private readonly messaging: MessagingProvider,
    private readonly topics: TopicProvider,
  ) {}

  get available(): boolean {
    return this.messaging.available;
  }

  sendToDevice(input: {
    token: string;
    title: string;
    body: string;
    data?: Record<string, string>;
    imageUrl?: string;
    priority?: 'normal' | 'high';
  }): Promise<FcmSendResult> {
    return this.messaging.send(input);
  }

  sendToDevices(input: {
    tokens: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
    imageUrl?: string;
    priority?: 'normal' | 'high';
  }): Promise<FcmMulticastResult> {
    return this.messaging.sendMulticast(input);
  }

  sendToTopic(
    topic: string,
    payload: { title: string; body: string; data?: Record<string, string>; imageUrl?: string },
  ) {
    return this.topics.broadcast(topic, payload);
  }

  subscribe(tokens: string[], topic: string) {
    return this.topics.subscribe(tokens, topic);
  }

  unsubscribe(tokens: string[], topic: string) {
    return this.topics.unsubscribe(tokens, topic);
  }
}
