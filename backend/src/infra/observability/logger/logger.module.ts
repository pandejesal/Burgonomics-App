import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { buildPinoOptions } from './pino.factory';

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ pinoHttp: buildPinoOptions(config) }),
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
