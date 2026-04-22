import {
  RECORDER_EVENTS_CHANNEL,
  RECORDER_IMAGE_KEY_PREFIX,
  RECORDER_RESPONSE_KEY_PREFIX,
  RECORDER_SNAPSHOT_KEY_PREFIX,
} from '../../src/common/constants/redis.constants';
import {
  RecorderCommandResult,
  RecorderLiveEvent,
  RecorderSessionDelta,
  RecorderSessionSnapshot,
} from '../../src/common/types/recorder.types';
import type { RedisConnection } from '../../src/common/utils/redis-connection';
import { RecorderSession, toRecorderActionSummary } from './recorder-model';

export function getRecorderResponseKey(requestId: string) {
  return `${RECORDER_RESPONSE_KEY_PREFIX}${requestId}`;
}

export function getRecorderSnapshotKey(sessionId: string) {
  return `${RECORDER_SNAPSHOT_KEY_PREFIX}${sessionId}`;
}

export function getRecorderImageKey(sessionId: string) {
  return `${RECORDER_IMAGE_KEY_PREFIX}${sessionId}`;
}

export async function publishRecorderLiveEvent(
  publisher: RedisConnection,
  session: RecorderSession,
  snapshot: RecorderSessionSnapshot,
  delta?: RecorderSessionDelta,
) {
  const event: RecorderLiveEvent = {
    sessionId: session.id,
    ownerId: session.ownerId,
    snapshot,
    delta,
  };

  await publisher.publish(RECORDER_EVENTS_CHANNEL, JSON.stringify(event));
}

export async function publishRecorderResponse(
  publisher: RedisConnection,
  requestId: string,
  result: RecorderCommandResult,
  ttlMs: number,
) {
  const responseKey = getRecorderResponseKey(requestId);

  await publisher
    .multi()
    .rpush(responseKey, JSON.stringify(result))
    .pexpire(responseKey, ttlMs)
    .exec();
}

export async function captureRecorderSnapshot(
  publisher: RedisConnection,
  session: RecorderSession,
  ttlMs: number,
  delta?: RecorderSessionDelta,
) {
  if (session.page.isClosed()) {
    return null;
  }

  const buffer = await session.page.screenshot({
    type: 'jpeg',
    quality: 65,
  });
  const viewportSize = session.page.viewportSize() ?? {
    width: 1440,
    height: 900,
  };
  const snapshot: RecorderSessionSnapshot = {
    sessionId: session.id,
    ownerId: session.ownerId,
    pageUrl: session.page.url(),
    imageBase64: buffer.toString('base64'),
    mimeType: 'image/jpeg',
    updatedAt: new Date().toISOString(),
    viewport: viewportSize,
    actionCount: session.actions.length,
    actions: session.actions.map(toRecorderActionSummary),
    suggestions: session.suggestions,
    precheckIssues: session.precheckIssues,
  };

  session.latestScreenshotBase64 = snapshot.imageBase64;
  session.latestMimeType = snapshot.mimeType;
  session.latestUpdatedAt = snapshot.updatedAt;

  await publisher.set(
    getRecorderSnapshotKey(session.id),
    JSON.stringify({
      ...snapshot,
      imageBase64: '',
    }),
    'PX',
    ttlMs,
  );

  await publisher.set(
    getRecorderImageKey(session.id),
    buffer,
    'PX',
    ttlMs,
  );

  await publishRecorderLiveEvent(publisher, session, snapshot, delta).catch(() => undefined);

  return snapshot;
}

export function startRecorderScreenshotLoop(
  publisher: RedisConnection,
  session: RecorderSession,
  screenshotIntervalMs: number,
  ttlMs: number,
) {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const schedule = () => {
    if (stopped) {
      return;
    }

    timer = setTimeout(() => {
      void captureRecorderSnapshot(publisher, session, ttlMs)
        .catch(() => undefined)
        .finally(schedule);
    }, screenshotIntervalMs);
  };

  schedule();

  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
    }
  };
}
