import { Injectable, NotImplementedException } from '@nestjs/common';
import type { SmsGateway } from './interfaces/sms-gateway.interface';

@Injectable()
export class DefaultSmsGateway implements SmsGateway {
  readonly name = 'default';

  async send(_input: { to: string; message: string }): Promise<{ messageId: string }> {
    throw new NotImplementedException('SMS provider not yet configured');
  }
}
