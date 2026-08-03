import { Global, Module } from '@nestjs/common';
import { FirebaseAppProvider } from './providers/firebase-app.provider';
import { MessagingProvider } from './providers/messaging.provider';
import { TopicProvider } from './providers/topic.provider';
import { FirebaseService } from './services/firebase.service';
import { FirebaseMessagingHealthIndicator } from './health/firebase-messaging.indicator';

/**
 * Firebase integration module.
 *
 * The ONLY entry-point to Firebase Admin in the platform. Feature
 * modules import `FirebaseService`; no other file may import
 * `firebase-admin` directly.
 */
@Global()
@Module({
  providers: [
    FirebaseAppProvider,
    MessagingProvider,
    TopicProvider,
    FirebaseService,
    FirebaseMessagingHealthIndicator,
  ],
  exports: [FirebaseService, FirebaseMessagingHealthIndicator, FirebaseAppProvider],
})
export class FirebaseModule {}
