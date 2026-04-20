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
  RecorderLiveEvent,
  RecorderSessionSnapshot,
} from 'src/common/types/recorder.types';
import { AuthService } from 'src/modules/auth/auth.service';
import { AuthenticatedUser } from 'src/modules/auth/auth.types';
import { RecorderService } from 'src/modules/recorder/recorder.service';
import { SubscribeRecorderDto } from './dto/subscribe-recorder.dto';

@WebSocketGateway({
  namespace: '/recorder',
  cors: {
    origin: '*',
  },
})
export class RecorderEventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RecorderEventsGateway.name);

  constructor(
    private readonly authService: AuthService,
    private readonly recorderService: RecorderService,
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
    } catch (error) {
      this.logger.warn(`Rejected recorder WebSocket client ${client.id}`);
      client.emit('error', {
        message: error instanceof Error ? error.message : 'Unauthorized websocket client',
      });
      client.disconnect(true);
      return;
    }

    client.emit('connected', {
      clientId: client.id,
      message: 'Connected to CloudFlow recorder stream',
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Recorder WebSocket client disconnected: ${client.id}`);
  }

  @SubscribeMessage('recorder:subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribeRecorderDto,
  ) {
    const user = client.data.user as AuthenticatedUser | undefined;

    if (!user) {
      throw new WsException('Unauthorized');
    }

    await this.recorderService.getSession(payload.sessionId, user);
    await client.join(this.getRecorderRoom(payload.sessionId));

    return {
      event: 'recorder:subscribed',
      data: {
        sessionId: payload.sessionId,
      },
    };
  }

  @SubscribeMessage('recorder:unsubscribe')
  async handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribeRecorderDto,
  ) {
    await client.leave(this.getRecorderRoom(payload.sessionId));
    return {
      event: 'recorder:unsubscribed',
      data: {
        sessionId: payload.sessionId,
      },
    };
  }

  emitRecorderEvent(sessionId: string, event: RecorderLiveEvent) {
    this.server
      .to(this.getRecorderRoom(sessionId))
      .emit('recorder:live', this.serializeRecorderEvent(event));
  }

  private getRecorderRoom(sessionId: string) {
    return `recorder:${sessionId}`;
  }

  private serializeRecorderEvent(event: RecorderLiveEvent): RecorderLiveEvent {
    const snapshot = event.snapshot as RecorderSessionSnapshot;

    if (!snapshot.imageBase64?.trim()) {
      return event;
    }

    return {
      ...event,
      snapshot: {
        ...snapshot,
        imageBase64: undefined as unknown as string,
        imageBuffer: Buffer.from(snapshot.imageBase64, 'base64'),
      } as RecorderLiveEvent['snapshot'],
    };
  }

  private resolveToken(client: Socket) {
    const authToken = client.handshake.auth?.token;

    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }

    const authorizationHeader = client.handshake.headers.authorization;

    if (
      typeof authorizationHeader === 'string' &&
      authorizationHeader.startsWith('Bearer ')
    ) {
      return authorizationHeader.slice(7).trim();
    }

    return '';
  }
}
