import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './modules/admin/admin.module';
import { AlertModule } from './modules/alert/alert.module';
import { ExecutionModule } from './modules/execution/execution.module';
import { NotificationModule } from './modules/notification/notification.module';
import { StoreModule } from './modules/store/store.module';
import { TaskModule } from './modules/task/task.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { WsModule } from './ws/ws.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    AdminModule,
    AlertModule,
    NotificationModule,
    QueueModule,
    WsModule,
    ExecutionModule,
    StoreModule,
    WorkflowModule,
    TaskModule,
  ],
})
export class AppModule {}
