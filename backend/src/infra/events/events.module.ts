import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DomainEventBus } from './domain-event-bus';

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 50,
      verboseMemoryLeak: false,
    }),
  ],
  providers: [DomainEventBus],
  exports: [DomainEventBus],
})
export class EventsModule {}
