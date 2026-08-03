import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import type { FirebaseConfig } from '@config/firebase.config';

/**
 * Owns the firebase-admin `App` singleton. The rest of the platform
 * only ever consumes services derived from this app (Messaging,
 * Topics). No other module may import `firebase-admin` directly.
 */
@Injectable()
export class FirebaseAppProvider implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FirebaseAppProvider.name);
  private _app: admin.app.App | null = null;

  constructor(private readonly config: ConfigService) {}

  get app(): admin.app.App {
    if (!this._app) {
      throw new Error('Firebase app not initialized');
    }
    return this._app;
  }

  get isConfigured(): boolean {
    return this._app !== null;
  }

  onModuleInit(): void {
    const cfg = this.config.getOrThrow<FirebaseConfig>('firebase');
    if (!cfg.projectId || !cfg.clientEmail || !cfg.privateKey) {
      this.logger.warn(
        'Firebase credentials missing — FCM disabled. Set FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.',
      );
      return;
    }

    const existing = admin.apps.find((a) => a?.name === 'burgonomics');
    if (existing) {
      this._app = existing;
      return;
    }

    this._app = admin.initializeApp(
      {
        credential: admin.credential.cert({
          projectId: cfg.projectId,
          clientEmail: cfg.clientEmail,
          privateKey: cfg.privateKey,
        }),
      },
      'burgonomics',
    );
    this.logger.log(`Firebase app initialized for project ${cfg.projectId}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this._app) {
      await this._app.delete().catch(() => undefined);
      this._app = null;
    }
  }
}
