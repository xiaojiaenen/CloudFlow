import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TaskExecutionEvent } from 'src/common/types/execution-event.types';
import { SubscribeTaskDto } from './dto/subscribe-task.dto';

@WebSocketGateway({
  namespace: '/tasks',
  cors: {
    origin: '*',
  },
})
export class TaskEventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TaskEventsGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.log(`WebSocket client connected: ${client.id}`);
    client.emit('connected', {
      clientId: client.id,
      message: 'Connected to CloudFlow task stream',
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`WebSocket client disconnected: ${client.id}`);
  }

  @SubscribeMessage('task:subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribeTaskDto,
  ) {
    await client.join(this.getTaskRoom(payload.taskId));
    return {
      event: 'task:subscribed',
      data: {
        taskId: payload.taskId,
      },
    };
  }

  @SubscribeMessage('task:unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribeTaskDto,
  ) {
    await client.leave(this.getTaskRoom(payload.taskId));
    return {
      event: 'task:unsubscribed',
      data: {
        taskId: payload.taskId,
      },
    };
  }

  emitTaskEvent(taskId: string, event: TaskExecutionEvent) {
    this.server.to(this.getTaskRoom(taskId)).emit('task:event', event);
  }

  private getTaskRoom(taskId: string) {
    return `task:${taskId}`;
  }
}
