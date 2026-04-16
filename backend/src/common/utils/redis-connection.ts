import type { ConfigService } from '@nestjs/config';
import IORedis, { Cluster } from 'ioredis';

type RedisValueReader = (key: string) => string | undefined;

export type RedisMode = 'standalone' | 'cluster';

export type RedisConnection = IORedis | Cluster;

interface RedisStartupNode {
  host: string;
  port: number;
}

export interface RedisConnectionFactoryOptions {
  maxRetriesPerRequest?: number | null;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
  connectionName?: string;
}

export interface ResolvedRedisConfig {
  mode: RedisMode;
  url: string;
  clusterNodes: RedisStartupNode[];
  username?: string;
  password?: string;
  useTls: boolean;
  bullPrefix: string;
}

function normalizeBoolean(value?: string) {
  return value === 'true' || value === '1';
}

function parseNodeToken(token: string) {
  const normalized = token.trim();
  if (!normalized) {
    throw new Error('REDIS_CLUSTER_NODES contains an empty node entry.');
  }

  if (normalized.includes('://')) {
    const url = new URL(normalized);
    if (!url.hostname) {
      throw new Error(`Invalid Redis cluster node: ${normalized}`);
    }

    return {
      node: {
        host: url.hostname,
        port: Number(url.port || 6379),
      },
      username: url.username || undefined,
      password: url.password || undefined,
      useTls: url.protocol === 'rediss:',
    };
  }

  const [host, portText] = normalized.split(':');
  if (!host) {
    throw new Error(`Invalid Redis cluster node: ${normalized}`);
  }

  const port = Number(portText || 6379);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid Redis cluster node port: ${normalized}`);
  }

  return {
    node: { host, port },
    username: undefined,
    password: undefined,
    useTls: false,
  };
}

function createConfigFromReader(read: RedisValueReader): ResolvedRedisConfig {
  const clusterNodesRaw = read('REDIS_CLUSTER_NODES') || read('REDIS_NODES') || '';
  const explicitMode = read('REDIS_MODE');
  const inferredMode: RedisMode = clusterNodesRaw.trim() ? 'cluster' : 'standalone';
  const mode: RedisMode =
    explicitMode === 'cluster' || explicitMode === 'standalone'
      ? explicitMode
      : inferredMode;

  const startupNodes = clusterNodesRaw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parseNodeToken);

  const derivedUsername = startupNodes.find((item) => item.username)?.username;
  const derivedPassword = startupNodes.find((item) => item.password)?.password;
  const derivedUseTls = startupNodes.some((item) => item.useTls);
  const useTls = normalizeBoolean(read('REDIS_TLS')) || derivedUseTls;

  return {
    mode,
    url: read('REDIS_URL') || 'redis://127.0.0.1:6379',
    clusterNodes: startupNodes.map((item) => item.node),
    username: read('REDIS_USERNAME') || derivedUsername,
    password: read('REDIS_PASSWORD') || derivedPassword,
    useTls,
    bullPrefix:
      read('REDIS_BULL_PREFIX') || (mode === 'cluster' ? '{bull}' : 'bull'),
  };
}

function isConfigService(
  source: ConfigService | NodeJS.ProcessEnv,
): source is ConfigService {
  return typeof (source as ConfigService).get === 'function';
}

export function resolveRedisConfig(configService: ConfigService): ResolvedRedisConfig;
export function resolveRedisConfig(env?: NodeJS.ProcessEnv): ResolvedRedisConfig;
export function resolveRedisConfig(
  source?: ConfigService | NodeJS.ProcessEnv,
): ResolvedRedisConfig {
  if (!source) {
    return createConfigFromReader((key) => process.env[key]);
  }

  if (isConfigService(source)) {
    return createConfigFromReader((key) => source.get<string>(key));
  }

  const env = source as NodeJS.ProcessEnv;
  return createConfigFromReader((key) => env[key]);
}

export function createRedisConnection(
  config: ResolvedRedisConfig,
  options: RedisConnectionFactoryOptions = {},
): RedisConnection {
  const {
    maxRetriesPerRequest = null,
    enableReadyCheck = false,
    lazyConnect,
    connectionName,
  } = options;

  if (config.mode === 'cluster') {
    if (config.clusterNodes.length === 0) {
      throw new Error(
        'REDIS_MODE=cluster requires REDIS_CLUSTER_NODES or REDIS_NODES.',
      );
    }

    return new IORedis.Cluster(config.clusterNodes, {
      enableReadyCheck,
      slotsRefreshTimeout: 2000,
      redisOptions: {
        maxRetriesPerRequest,
        enableReadyCheck,
        lazyConnect,
        connectionName,
        username: config.username,
        password: config.password,
        tls: config.useTls ? {} : undefined,
      },
    });
  }

  return new IORedis(config.url, {
    maxRetriesPerRequest,
    enableReadyCheck,
    lazyConnect,
    connectionName,
    username: config.username,
    password: config.password,
    tls: config.useTls ? {} : undefined,
  });
}
