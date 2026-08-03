import { Global, Module } from '@nestjs/common';
import { INJECTION_TOKENS } from '@common/constants';
import { FirebaseFcmGateway } from './fcm.gateway';
import { DefaultSmsGateway } from './sms.gateway';

@Global()
@Module({
  providers: [
    FirebaseFcmGateway,
    DefaultSmsGateway,
    { provide: INJECTION_TOKENS.FCM_GATEWAY, useExisting: FirebaseFcmGateway },
    { provide: INJECTION_TOKENS.SMS_GATEWAY, useExisting: DefaultSmsGateway },
  ],
  exports: [INJECTION_TOKENS.FCM_GATEWAY, INJECTION_TOKENS.SMS_GATEWAY],
})
export class NotificationsInfraModule {}
