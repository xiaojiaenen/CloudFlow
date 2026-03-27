import { Module } from '@nestjs/common';
import { WsModule } from 'src/ws/ws.module';
import { ExecutionEventsService } from './execution-events.service';

@Module({
  imports: [WsModule],
  providers: [ExecutionEventsService],
})
export class ExecutionModule {}
