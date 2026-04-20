import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import {
  TaskExecutionEvent,
  TaskScreenshotPayload,
} from 'src/common/types/execution-event.types';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthService } from 'src/modules/auth/auth.service';
import { AuthenticatedUser } from 'src/modules/auth/auth.types';
import { SubscribeTaskDto } from './dto/subscribe-task.dto';

@WebSocketGateway({
  namespace: '/tasks',
  cors: {
    origin: '*',
  },
})
export class TaskEventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TaskEventsGateway.name);

  constructor(
    private readonly authService: AuthService,
    private readonly prismaService: PrismaService,
  ) {}

  @WebSocketServer()
  server!: Server;

  async handleConnection(client: Socket) {
    try {
      const token = this.resolveToken(client);

      if (!token) {
        throw new WsException('Missing auth token');
      }

      const user = await this.authService.getCurrentUserFromToken(token);
      client.data.user = user;
      this.logger.log(`WebSocket client connected: ${client.id} (${user.email})`);
    } catch (error) {
      this.logger.warn(`Rejected WebSocket client ${client.id}`);
      client.emit('error', {
        message: error instanceof Error ? error.message : 'Unauthorized websocket client',
      });
      client.disconnect(true);
      return;
    }

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
    const user = client.data.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new WsException('Unauthorized');
    }

    const task = await this.prismaService.task.findUnique({
      where: {
        id: payload.taskId,
      },
      select: {
        id: true,
        ownerId: true,
      },
    });

    if (!task) {
      throw new WsException('Task not found');
    }

    if (user.role !== 'admin' && task.ownerId !== user.id) {
      throw new WsException('Forbidden');
    }

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
    this.server
      .to(this.getTaskRoom(taskId))
      .emit('task:event', this.serializeTaskEvent(event));
  }

  private getTaskRoom(taskId: string) {
    return `task:${taskId}`;
  }

  private serializeTaskEvent(event: TaskExecutionEvent): TaskExecutionEvent {
    if (event.type !== 'screenshot') {
      return event;
    }

    const payload = event.data as TaskScreenshotPayload;

    if (!payload.imageBase64?.trim()) {
      return event;
    }

    return {
      ...event,
      data: {
        ...payload,
        imageBase64: undefined,
        imageBuffer: Buffer.from(payload.imageBase64, 'base64'),
      },
    };
  }

  private resolveToken(client: Socket) {
    const authToken = client.handshake.auth?.token;

    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }

    const authorizationHeader = client.handshake.headers.authorization;

    if (typeof authorizationHeader === 'string' && authorizationHeader.startsWith('Bearer ')) {
      return authorizationHeader.slice(7).trim();
    }

    return '';
  }
}
