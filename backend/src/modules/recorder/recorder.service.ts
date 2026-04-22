import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  RequestTimeoutException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  RECORDER_CONTROL_CHANNEL,
  RECORDER_IMAGE_KEY_PREFIX,
  RECORDER_RESPONSE_KEY_PREFIX,
  RECORDER_SNAPSHOT_KEY_PREFIX,
} from 'src/common/constants/redis.constants';
import {
  RecorderCommandPayload,
  RecorderCommandResult,
  RecorderSessionSnapshot,
} from 'src/common/types/recorder.types';
import {
  createRedisConnection,
  resolveRedisConfig,
  type RedisConnection,
} from 'src/common/utils/redis-connection';
import { AuthenticatedUser } from '../auth/auth.types';

@Injectable()
export class RecorderService implements OnModuleDestroy {
  private readonly redisConnection: RedisConnection;

  constructor(private readonly configService: ConfigService) {
    const redisConfig = resolveRedisConfig(this.configService);
    this.redisConnection = createRedisConnection(redisConfig, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectionName: 'cloudflow-recorder-service',
    });
  }

  async onModuleDestroy() {
    await this.redisConnection.quit();
  }

  async createSession(
    payload: {
      url?: string;
      name?: string;
    },
    currentUser: AuthenticatedUser,
  ) {
    const sessionId = randomUUID();
    const result = await this.dispatchCommand({
      requestId: randomUUID(),
      sessionId,
      ownerId: currentUser.id,
      type: 'create',
      url: payload.url,
      name: payload.name,
    });

    return result.snapshot;
  }

  async getSession(sessionId: string, currentUser: AuthenticatedUser) {
    const snapshot = await this.readSnapshot(sessionId);
    this.assertSnapshotAccess(snapshot, currentUser);
    return snapshot;
  }

  async navigate(
    sessionId: string,
    payload: {
      url: string;
    },
    currentUser: AuthenticatedUser,
  ) {
    await this.ensureSessionAccess(sessionId, currentUser);
    return this.dispatchCommand({
      requestId: randomUUID(),
      sessionId,
      type: 'navigate',
      url: payload.url,
    });
  }

  async click(
    sessionId: string,
    payload: {
      xRatio: number;
      yRatio: number;
    },
    currentUser: AuthenticatedUser,
  ) {
    await this.ensureSessionAccess(sessionId, currentUser);
    return this.dispatchCommand({
      requestId: randomUUID(),
      sessionId,
      type: 'click',
      xRatio: payload.xRatio,
      yRatio: payload.yRatio,
    });
  }

  async input(
    sessionId: string,
    payload: {
      xRatio: number;
      yRatio: number;
      value: string;
    },
    currentUser: AuthenticatedUser,
  ) {
    await this.ensureSessionAccess(sessionId, currentUser);
    return this.dispatchCommand({
      requestId: randomUUID(),
      sessionId,
      type: 'input',
      xRatio: payload.xRatio,
      yRatio: payload.yRatio,
      value: payload.value,
    });
  }

  async pressKey(
    sessionId: string,
    payload: {
      key: string;
    },
    currentUser: AuthenticatedUser,
  ) {
    await this.ensureSessionAccess(sessionId, currentUser);
    return this.dispatchCommand({
      requestId: randomUUID(),
      sessionId,
      type: 'press_key',
      key: payload.key,
    });
  }

  async scroll(
    sessionId: string,
    payload: {
      direction: 'up' | 'down' | 'top' | 'bottom';
      distance?: number;
    },
    currentUser: AuthenticatedUser,
  ) {
    await this.ensureSessionAccess(sessionId, currentUser);
    return this.dispatchCommand({
      requestId: randomUUID(),
      sessionId,
      type: 'scroll',
      direction: payload.direction,
      distance: payload.distance,
    });
  }

  async updateAction(
    sessionId: string,
    actionId: string,
    payload: {
      label?: string;
      selector?: string;
      value?: string;
      url?: string;
      key?: string;
      direction?: 'up' | 'down' | 'top' | 'bottom';
      distance?: number;
      parameterKey?: string;
      parameterLabel?: string;
      parameterDescription?: string;
      useRuntimeInput?: boolean;
    },
    currentUser: AuthenticatedUser,
  ) {
    await this.ensureSessionAccess(sessionId, currentUser);
    return this.dispatchCommand({
      requestId: randomUUID(),
      sessionId,
      type: 'update_action',
      actionId,
      ...payload,
    });
  }

  async moveAction(
    sessionId: string,
    actionId: string,
    payload: {
      direction: 'up' | 'down';
    },
    currentUser: AuthenticatedUser,
  ) {
    await this.ensureSessionAccess(sessionId, currentUser);
    return this.dispatchCommand({
      requestId: randomUUID(),
      sessionId,
      type: 'move_action',
      actionId,
      moveDirection: payload.direction,
    });
  }

  async deleteAction(
    sessionId: string,
    actionId: string,
    currentUser: AuthenticatedUser,
  ) {
    await this.ensureSessionAccess(sessionId, currentUser);
    return this.dispatchCommand({
      requestId: randomUUID(),
      sessionId,
      type: 'delete_action',
      actionId,
    });
  }

  async clearActions(sessionId: string, currentUser: AuthenticatedUser) {
    await this.ensureSessionAccess(sessionId, currentUser);
    return this.dispatchCommand({
      requestId: randomUUID(),
      sessionId,
      type: 'clear_actions',
    });
  }

  async resumeFromAction(
    sessionId: string,
    actionId: string,
    currentUser: AuthenticatedUser,
  ) {
    await this.ensureSessionAccess(sessionId, currentUser);
    return this.dispatchCommand({
      requestId: randomUUID(),
      sessionId,
      type: 'resume_from_action',
      actionId,
    }, 30_000);
  }

  async analyze(sessionId: string, currentUser: AuthenticatedUser) {
    await this.ensureSessionAccess(sessionId, currentUser);
    return this.dispatchCommand({
      requestId: randomUUID(),
      sessionId,
      type: 'analyze',
    });
  }

  async precheck(sessionId: string, currentUser: AuthenticatedUser) {
    await this.ensureSessionAccess(sessionId, currentUser);
    return this.dispatchCommand({
      requestId: randomUUID(),
      sessionId,
      type: 'precheck',
    });
  }

  async finish(
    sessionId: string,
    payload: {
      name?: string;
      mode?: 'workflow' | 'template';
    },
    currentUser: AuthenticatedUser,
  ) {
    await this.ensureSessionAccess(sessionId, currentUser);
    return this.dispatchCommand({
      requestId: randomUUID(),
      sessionId,
      type: 'finish',
      name: payload.name,
      mode: payload.mode,
    });
  }

  async close(sessionId: string, currentUser: AuthenticatedUser) {
    await this.ensureSessionAccess(sessionId, currentUser);
    return this.dispatchCommand({
      requestId: randomUUID(),
      sessionId,
      type: 'close',
    });
  }

  private async dispatchCommand(command: RecorderCommandPayload, timeoutMs = 10_000) {
    const responseKey = `${RECORDER_RESPONSE_KEY_PREFIX}${command.requestId}`;
    await this.redisConnection.publish(
      RECORDER_CONTROL_CHANNEL,
      JSON.stringify(command),
    );

    const blockingTimeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
    const rawResponse = await this.redisConnection.brpop(
      responseKey,
      blockingTimeoutSeconds,
    );

    await this.redisConnection.del(responseKey).catch(() => undefined);

    const raw =
      Array.isArray(rawResponse) && rawResponse.length > 1 ? rawResponse[1] : null;

    if (raw?.trim()) {
      const result = JSON.parse(raw) as RecorderCommandResult;

      if (!result.ok) {
        throw new BadRequestException(
          result.error || '录制器命令执行失败。',
        );
      }

      return result;
    }

    throw new RequestTimeoutException('录制器响应超时，请稍后重试。');
  }

  private async ensureSessionAccess(sessionId: string, currentUser: AuthenticatedUser) {
    const snapshot = await this.readSnapshot(sessionId);
    this.assertSnapshotAccess(snapshot, currentUser);
    return snapshot;
  }

  private assertSnapshotAccess(
    snapshot: RecorderSessionSnapshot,
    currentUser: AuthenticatedUser,
  ) {
    if (currentUser.role !== 'admin' && snapshot.ownerId !== currentUser.id) {
      throw new NotFoundException(`Recorder session ${snapshot.sessionId} not found`);
    }
  }

  private async readSnapshot(sessionId: string) {
    const raw = await this.redisConnection.get(
      `${RECORDER_SNAPSHOT_KEY_PREFIX}${sessionId}`,
    );

    if (!raw?.trim()) {
      throw new NotFoundException(`Recorder session ${sessionId} not found`);
    }

    const snapshot = JSON.parse(raw) as Omit<RecorderSessionSnapshot, 'imageBase64'> & {
      imageBase64?: string;
    };
    const imageBuffer = await this.redisConnection.getBuffer(
      `${RECORDER_IMAGE_KEY_PREFIX}${sessionId}`,
    );

    return {
      ...snapshot,
      imageBase64:
        imageBuffer && imageBuffer.length > 0
          ? imageBuffer.toString('base64')
          : snapshot.imageBase64 ?? '',
    } as RecorderSessionSnapshot;
  }
}
