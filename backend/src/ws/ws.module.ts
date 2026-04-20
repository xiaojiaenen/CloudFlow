import { Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { RecorderModule } from 'src/modules/recorder/recorder.module';
import { RecorderEventsGateway } from './recorder-events.gateway';
import { RecorderEventsService } from './recorder-events.service';
import { TaskEventsGateway } from './task-events.gateway';

@Module({
  imports: [AuthModule, RecorderModule],
  providers: [TaskEventsGateway, RecorderEventsGateway, RecorderEventsService],
  exports: [TaskEventsGateway, RecorderEventsGateway],
})
export class WsModule {}
