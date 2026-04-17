import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ApplicationBusService } from './application-bus.service';

@Global()
@Module({
  imports: [CqrsModule.forRoot()],
  providers: [ApplicationBusService],
  exports: [CqrsModule, ApplicationBusService],
})
export class ApplicationBusModule {}
