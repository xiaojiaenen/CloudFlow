import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AlertController } from './alert.controller';
import { AlertService } from './alert.service';

@Module({
  imports: [AuthModule],
  controllers: [AlertController],
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertModule {}
