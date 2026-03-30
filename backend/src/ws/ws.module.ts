import { Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { TaskEventsGateway } from './task-events.gateway';

@Module({
  imports: [AuthModule],
  providers: [TaskEventsGateway],
  exports: [TaskEventsGateway],
})
export class WsModule {}
