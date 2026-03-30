import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';

@Module({
  imports: [AdminModule],
  controllers: [StoreController],
  providers: [StoreService],
})
export class StoreModule {}
