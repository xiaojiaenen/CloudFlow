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

  async finish(
    sessionId: string,
    payload: {
      name?: string;
    },
    currentUser: AuthenticatedUser,
  ) {
    await this.ensureSessionAccess(sessionId, currentUser);
    return this.dispatchCommand({
      requestId: randomUUID(),
      sessionId,
      type: 'finish',
      name: payload.name,
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
    await this.redisConnection.publish(
      RECORDER_CONTROL_CHANNEL,
      JSON.stringify(command),
    );

    const responseKey = `${RECORDER_RESPONSE_KEY_PREFIX}${command.requestId}`;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const raw = await this.redisConnection.get(responseKey);

      if (raw?.trim()) {
        await this.redisConnection.del(responseKey).catch(() => undefined);
        const result = JSON.parse(raw) as RecorderCommandResult;

        if (!result.ok) {
          throw new BadRequestException(
            result.error || '录制器命令执行失败。',
          );
        }

        return result;
      }

      await sleep(120);
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

    return JSON.parse(raw) as RecorderSessionSnapshot;
  }
}

function sleep(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
