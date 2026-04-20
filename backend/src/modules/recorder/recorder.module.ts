import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RecorderController } from './recorder.controller';
import { RecorderService } from './recorder.service';

@Module({
  imports: [AuthModule],
  controllers: [RecorderController],
  providers: [RecorderService],
  exports: [RecorderService],
})
export class RecorderModule {}
