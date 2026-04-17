import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import { decryptSecretValue } from 'src/common/utils/secret-envelope';
import { PrismaService } from 'src/prisma/prisma.service';
import { TaskScreenshotPayload } from 'src/common/types/execution-event.types';

type StorageProvider = 'minio' | 'local';

type ScreenshotStorageConfig = {
  provider: StorageProvider;
  bucket: string;
  localBaseDir: string;
  minioEndpoint?: string;
  minioPort?: number;
  minioUseSSL?: boolean;
  minioAccessKey?: string;
  minioSecretKey?: string;
};

type ScreenshotObjectRef = {
  storageProvider?: string | null;
  storageBucket?: string | null;
  storageKey?: string | null;
  imageBase64?: string | null;
};

type MinioOverrideConfig = {
  minioEndpoint?: string | null;
  minioPort?: number | null;
  minioUseSSL?: boolean | null;
  minioAccessKey?: string | null;
  minioSecretKey?: string | null;
  minioBucket?: string | null;
};

@Injectable()
export class TaskArtifactStorageService {
  private readonly logger = new Logger(TaskArtifactStorageService.name);
  private readonly localBaseDir: string;
  private minioClient: MinioClient | null = null;
  private minioSignature: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {
    this.localBaseDir = this.configService.get<string>('TASK_ARTIFACTS_DIR')
      ? path.resolve(this.configService.get<string>('TASK_ARTIFACTS_DIR') as string)
      : path.resolve(process.cwd(), 'runtime', 'artifacts');
  }

  async saveScreenshot(
    taskId: string,
    sequence: number,
    payload: TaskScreenshotPayload,
  ) {
    const config = await this.resolveConfig();
    const extension = this.getExtension(payload.mimeType);
    const timestamp = payload.timestamp.replace(/[:.]/g, '-');
    const source = payload.source ?? 'stream';
    const key = `tasks/${taskId}/screenshots/${source}-${sequence}-${timestamp}.${extension}`;
    const buffer = Buffer.from(payload.imageBase64, 'base64');

    if (config.provider === 'minio') {
      const client = await this.getMinioClient(config);
      await this.ensureMinioBucket(client, config.bucket);
      await client.putObject(config.bucket, key, buffer, buffer.length, {
        'Content-Type': payload.mimeType,
      });
    } else {
      const targetPath = path.join(config.localBaseDir, key);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, buffer);
    }

    return {
      storageProvider: config.provider,
      storageBucket: config.bucket,
      storageKey: key,
      sizeBytes: buffer.length,
    };
  }

  async readScreenshot(ref: ScreenshotObjectRef) {
    if (ref.imageBase64) {
      return Buffer.from(ref.imageBase64, 'base64');
    }

    if (!ref.storageKey) {
      return null;
    }

    const provider = ref.storageProvider === 'minio' ? 'minio' : 'local';
    const bucket = ref.storageBucket || 'cloudflow-task-artifacts';

    if (provider === 'minio') {
      const config = await this.resolveConfig();
      const client = await this.getMinioClient({
        ...config,
        provider: 'minio',
        bucket,
      });
      const stream = await client.getObject(bucket, ref.storageKey);
      const chunks: Buffer[] = [];

      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        stream.on('end', () => resolve());
        stream.on('error', (error) => reject(error));
      });

      return Buffer.concat(chunks);
    }

    const targetPath = path.join(this.localBaseDir, ref.storageKey);
    return readFile(targetPath);
  }

  async deleteScreenshot(ref: ScreenshotObjectRef) {
    if (!ref.storageKey) {
      return;
    }

    const provider = ref.storageProvider === 'minio' ? 'minio' : 'local';
    const bucket = ref.storageBucket || 'cloudflow-task-artifacts';

    try {
      if (provider === 'minio') {
        const config = await this.resolveConfig();
        const client = await this.getMinioClient({
          ...config,
          provider: 'minio',
          bucket,
        });
        await client.removeObject(bucket, ref.storageKey);
        return;
      }

      await rm(path.join(this.localBaseDir, ref.storageKey), { force: true });
    } catch (error) {
      this.logger.warn(
        `Failed to delete screenshot object ${bucket}/${ref.storageKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async removeTaskTempDir(tempDir?: string | null) {
    if (!tempDir) {
      return;
    }

    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }

  async testConnection(overrides?: MinioOverrideConfig) {
    const config = await this.resolveConfig(overrides);
    if (config.provider !== 'minio') {
      throw new BadRequestException(
        '请先填写完整的 MinIO Endpoint、Access Key、Secret Key 和 Bucket。',
      );
    }

    const client = await this.getMinioClient(config);
    const bucketExists = await client.bucketExists(config.bucket).catch(() => false);

    return {
      endpoint: config.minioEndpoint as string,
      port: config.minioPort ?? 9000,
      useSSL: Boolean(config.minioUseSSL),
      bucket: config.bucket,
      bucketExists,
    };
  }

  private async resolveConfig(
    overrides?: MinioOverrideConfig,
  ): Promise<ScreenshotStorageConfig> {
    const systemConfig = await this.prismaService.systemConfig.findFirst({
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const endpoint = this.pickString(
      overrides?.minioEndpoint,
      systemConfig?.minioEndpoint,
      this.configService.get<string>('MINIO_ENDPOINT'),
    );
    const accessKey = this.pickString(
      overrides?.minioAccessKey,
      this.decryptOptionalSecret(systemConfig?.minioAccessKey),
      this.configService.get<string>('MINIO_ACCESS_KEY'),
    );
    const secretKey = this.pickString(
      overrides?.minioSecretKey,
      this.decryptOptionalSecret(systemConfig?.minioSecretKey),
      this.configService.get<string>('MINIO_SECRET_KEY'),
    );
    const bucket =
      this.pickString(
        overrides?.minioBucket,
        systemConfig?.minioBucket,
        this.configService.get<string>('MINIO_BUCKET'),
      ) || 'cloudflow-task-artifacts';

    if (endpoint && accessKey && secretKey) {
      return {
        provider: 'minio',
        bucket,
        localBaseDir: this.localBaseDir,
        minioEndpoint: endpoint,
        minioPort:
          overrides?.minioPort ??
          systemConfig?.minioPort ??
          Number(this.configService.get<string>('MINIO_PORT') || 9000),
        minioUseSSL:
          overrides?.minioUseSSL ??
          systemConfig?.minioUseSSL ??
          (this.configService.get<string>('MINIO_USE_SSL') === 'true'),
        minioAccessKey: accessKey,
        minioSecretKey: secretKey,
      };
    }

    return {
      provider: 'local',
      bucket,
      localBaseDir: this.localBaseDir,
    };
  }

  private async getMinioClient(config: ScreenshotStorageConfig) {
    const signature = [
      config.minioEndpoint,
      config.minioPort,
      config.minioUseSSL,
      config.minioAccessKey,
      config.minioSecretKey,
    ].join('|');

    if (!this.minioClient || this.minioSignature !== signature) {
      this.minioClient = new MinioClient({
        endPoint: config.minioEndpoint as string,
        port: config.minioPort,
        useSSL: Boolean(config.minioUseSSL),
        accessKey: config.minioAccessKey as string,
        secretKey: config.minioSecretKey as string,
      });
      this.minioSignature = signature;
    }

    return this.minioClient;
  }

  private async ensureMinioBucket(client: MinioClient, bucket: string) {
    const exists = await client.bucketExists(bucket).catch(() => false);
    if (!exists) {
      await client.makeBucket(bucket);
    }
  }

  private getExtension(mimeType: string) {
    if (mimeType === 'image/png') {
      return 'png';
    }

    if (mimeType === 'image/webp') {
      return 'webp';
    }

    return 'jpg';
  }

  private pickString(...values: Array<string | null | undefined>) {
    for (const value of values) {
      if (!value) {
        continue;
      }

      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    return '';
  }

  private decryptOptionalSecret(value?: string | null) {
    if (!value?.trim()) {
      return '';
    }

    return decryptSecretValue(
      value,
      this.configService.get<string>(
        'SECRET_ENCRYPTION_KEY',
        'cloudflow-dev-secret-key',
      ),
    );
  }
}
