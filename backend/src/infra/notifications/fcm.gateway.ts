import { Injectable, NotImplementedException } from '@nestjs/common';
import type { FcmGateway, FcmMessage } from './interfaces/fcm-gateway.interface';

/**
 * Firebase Cloud Messaging gateway stub. `firebase-admin` initialization
 * lives here in Phase 2; the interface remains the sole surface exposed
 * to feature modules.
 */
@Injectable()
export class FirebaseFcmGateway implements FcmGateway {
  readonly name = 'firebase';

  async send(_message: FcmMessage): Promise<{ messageId: string }> {
    throw new NotImplementedException('FCM not yet configured');
  }

  async sendMulticast(
    _messages: FcmMessage[],
  ): Promise<{ successCount: number; failureCount: number }> {
    throw new NotImplementedException('FCM not yet configured');
  }
}
