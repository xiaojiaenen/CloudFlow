import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SystemConfig } from '@prisma/client';
import { randomBytes } from 'crypto';
import {
  decryptSecretValue,
  encryptSecretValue,
  maskSecretValue,
} from 'src/common/utils/secret-envelope';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueueService } from 'src/queue/queue.service';
import { buildStoredPasswordHash } from '../auth/auth.utils';
import {
  AuthenticatedUser,
  AuthUserRole,
  AuthUserStatus,
} from '../auth/auth.types';
import { NotificationService } from '../notification/notification.service';
import { TaskArtifactStorageService } from '../storage/task-artifact-storage.service';
import { DEFAULT_WORKFLOW_TEMPLATES } from '../store/default-templates';
import { CreateTemplateDto } from './dto/create-template.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { PublishWorkflowTemplateDto } from './dto/publish-workflow-template.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService,
    private readonly notificationService: NotificationService,
    private readonly taskArtifactStorageService: TaskArtifactStorageService,
  ) {}

  async getOverview() {
    await this.ensureDefaultTemplates();

    const [
      workflowGroups,
      templateTotal,
      publishedTemplates,
      scheduledWorkflows,
      taskTotal,
      totalUsers,
    ] = await Promise.all([
      this.prismaService.workflow.groupBy({
        by: ['status'],
        where: {
          deletedAt: null,
        },
        _count: {
          status: true,
        },
      }),
      this.prismaService.workflowTemplate.count({
        where: {
          deletedAt: null,
        },
      }),
      this.prismaService.workflowTemplate.count({
        where: {
          deletedAt: null,
          published: true,
        },
      }),
      this.prismaService.workflow.count({
        where: {
          deletedAt: null,
          scheduleEnabled: true,
          status: {
            not: 'archived',
          },
        },
      }),
      this.prismaService.task.count(),
      this.userModel.count(),
    ]);

    const workflowCountMap = workflowGroups.reduce<Record<string, number>>(
      (acc, item: { status: string; _count: { status: number } }) => {
        acc[item.status] = item._count.status;
        return acc;
      },
      {},
    );

    return {
      metrics: {
        activeWorkflows: workflowCountMap.active ?? 0,
        draftWorkflows: workflowCountMap.draft ?? 0,
        archivedWorkflows: workflowCountMap.archived ?? 0,
        templateTotal,
        publishedTemplates,
        scheduledWorkflows,
        taskTotal,
        totalUsers,
      },
      roleMatrix: [
        {
          key: 'user',
          name: '普通用户',
          summary: '负责创建、运行和维护自己的自动化工作流。',
          capabilities: [
            '创建、编辑、复制和归档自己的工作流',
            '运行任务并查看日志、截图和监控详情',
            '配置调度、运行参数、凭据和邮件告警',
            '从工作流商店安装模板并继续编辑',
            '查看自己的任务历史和告警记录',
          ],
        },
        {
          key: 'admin',
          name: '管理员',
          summary: '负责平台治理、模板运营和系统级配置。',
          capabilities: [
            '拥有普通用户的全部能力',
            '管理模板发布、下架、推荐位和评分',
            '维护 SMTP、对象存储和平台参数',
            '查看 API、数据库、Redis 和队列健康状态',
            '管理用户角色、账号状态和密码重置',
          ],
        },
      ],
    };
  }

  async getHealth() {
    const queueHealth = await this.queueService.getHealth();
    const systemConfig = await this.getSystemConfig();
    let database = 'up';

    try {
      await this.prismaService.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }

    return {
      api: 'up',
      database,
      redis: queueHealth.redis,
      queues: queueHealth.queues,
      smtpConfigured: Boolean(
        systemConfig.smtpHost && systemConfig.smtpUser && systemConfig.smtpPass,
      ),
      storageConfigured: Boolean(
        systemConfig.minioEndpoint &&
          systemConfig.minioAccessKey &&
          systemConfig.minioSecretKey &&
          systemConfig.minioBucket,
      ),
      checkedAt: new Date().toISOString(),
      runtime: {
        nodeEnv: this.configService.get<string>('NODE_ENV', 'development'),
        port: this.configService.get<string>('PORT', '3001'),
      },
    };
  }

  async listUsers() {
    const users = await this.userModel.findMany({
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return users.map((user) => ({
      ...user,
      isSuperAdmin: this.isSuperAdminEmail(user.email),
    }));
  }

  async createUser(payload: CreateUserDto) {
    const email = payload.email.trim().toLowerCase();
    const existingUser = await this.userModel.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      throw new ConflictException('该邮箱已存在。');
    }

    const salt = randomBytes(16).toString('hex');
    const user = await this.userModel.create({
      data: {
        email,
        name: payload.name.trim(),
        role: (payload.role ?? 'user') as AuthUserRole,
        status: (payload.status ?? 'active') as AuthUserStatus,
        passwordHash: buildStoredPasswordHash(payload.password, salt),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...user,
      isSuperAdmin: this.isSuperAdminEmail(user.email),
    };
  }

  async updateUser(
    id: string,
    payload: UpdateUserDto,
    currentUser: AuthenticatedUser,
  ) {
    const user = await this.userModel.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    if (user.id === currentUser.id && payload.status === 'suspended') {
      throw new BadRequestException('不能停用当前登录中的管理员账号。');
    }

    const updatedUser = await this.userModel.update({
      where: { id },
      data: {
        ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
        ...(payload.role !== undefined ? { role: payload.role } : {}),
        ...(payload.status !== undefined ? { status: payload.status } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...updatedUser,
      isSuperAdmin: this.isSuperAdminEmail(updatedUser.email),
    };
  }

  async resetUserPassword(id: string, payload: ResetUserPasswordDto) {
    const user = await this.userModel.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    const nextPassword =
      payload.newPassword?.trim() || this.generateTemporaryPassword();
    const salt = randomBytes(16).toString('hex');

    await this.userModel.update({
      where: { id },
      data: {
        passwordHash: buildStoredPasswordHash(nextPassword, salt),
      },
    });

    return {
      id: user.id,
      email: user.email,
      temporaryPassword: nextPassword,
    };
  }

  async getSystemConfig() {
    const config = await this.ensureSystemConfig();
    return this.serializeSystemConfig(config);
  }

  async updateSystemConfig(
    payload: UpdateSystemConfigDto,
    currentUser: AuthenticatedUser,
  ) {
    const config = await this.ensureSystemConfig();
    const beforeSnapshot = this.serializeSystemConfig(config);
    const data = this.buildSystemConfigUpdateData(payload);

    const updatedConfig = await this.prismaService.systemConfig.update({
      where: {
        id: config.id,
      },
      data,
    });
    const afterSnapshot = this.serializeSystemConfig(updatedConfig);

    const changedFields = Object.keys(data);
    if (changedFields.length > 0) {
      await this.prismaService.systemConfigAudit.create({
        data: {
          systemConfigId: updatedConfig.id,
          actorId: currentUser.id,
          changedFields: changedFields as unknown as Prisma.InputJsonValue,
          beforeSnapshot: this.buildConfigAuditSnapshot(
            beforeSnapshot,
            changedFields,
          ) as unknown as Prisma.InputJsonValue,
          afterSnapshot: this.buildConfigAuditSnapshot(
            afterSnapshot,
            changedFields,
          ) as unknown as Prisma.InputJsonValue,
        },
      });
    }

    return afterSnapshot;
  }

  async testSmtpConnection(payload: UpdateSystemConfigDto) {
    try {
      const result = await this.notificationService.testSmtpConnection({
        smtpHost: payload.smtpHost,
        smtpPort: payload.smtpPort,
        smtpUser: payload.smtpUser,
        smtpPass: payload.smtpPass,
        smtpSecure: payload.smtpSecure,
        smtpIgnoreTlsCertificate: payload.smtpIgnoreTlsCertificate,
      });

      return {
        success: true,
        message: `SMTP 连接成功：${result.host}:${result.port}${
          result.secure ? '（SSL/TLS）' : ''
        }`,
        ...result,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        error instanceof Error
          ? `SMTP 测试失败：${error.message}`
          : 'SMTP 测试失败，请检查主机、端口、账号和密码。',
      );
    }
  }

  async testMinioConnection(payload: UpdateSystemConfigDto) {
    try {
      const result = await this.taskArtifactStorageService.testConnection({
        minioEndpoint: payload.minioEndpoint,
        minioPort: payload.minioPort,
        minioUseSSL: payload.minioUseSSL,
        minioAccessKey: payload.minioAccessKey,
        minioSecretKey: payload.minioSecretKey,
        minioBucket: payload.minioBucket,
      });

      return {
        success: true,
        message: result.bucketExists
          ? `MinIO 连接成功，Bucket「${result.bucket}」可用。`
          : `MinIO 连接成功，但 Bucket「${result.bucket}」当前不存在。`,
        ...result,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        error instanceof Error
          ? `MinIO 测试失败：${error.message}`
          : 'MinIO 测试失败，请检查 Endpoint、端口、Access Key、Secret Key 和 Bucket。',
      );
    }
  }

  async listTemplates(filters?: {
    search?: string;
    published?: string;
    includeDeleted?: string;
  }) {
    await this.ensureDefaultTemplates();

    const where: Prisma.WorkflowTemplateWhereInput = {
      ...(filters?.includeDeleted === 'true' ? {} : { deletedAt: null }),
      ...(filters?.published === 'true'
        ? { published: true }
        : filters?.published === 'false'
          ? { published: false }
          : {}),
      ...(filters?.search?.trim()
        ? {
            OR: [
              {
                title: {
                  contains: filters.search.trim(),
                },
              },
              {
                description: {
                  contains: filters.search.trim(),
                },
              },
              {
                category: {
                  contains: filters.search.trim(),
                },
              },
            ],
          }
        : {}),
    };

    return this.prismaService.workflowTemplate.findMany({
      where,
      orderBy: [{ featured: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createTemplate(
    payload: CreateTemplateDto,
    currentUser: AuthenticatedUser,
  ) {
    try {
      return await this.prismaService.workflowTemplate.create({
        data: {
          slug: payload.slug.trim(),
          publisherId: currentUser.id,
          title: payload.title.trim(),
          description: payload.description.trim(),
          category: payload.category.trim(),
          tags: payload.tags as unknown as Prisma.InputJsonValue,
          definition: payload.definition as Prisma.InputJsonValue,
          authorName: payload.authorName?.trim() || 'CloudFlow 官方',
          published: payload.published ?? false,
          featured: payload.featured ?? false,
          rating: payload.rating ?? 4.8,
        },
      });
    } catch (error) {
      this.handleTemplateConflict(error);
      throw error;
    }
  }

  async publishTemplateFromWorkflow(
    payload: PublishWorkflowTemplateDto,
    currentUser: AuthenticatedUser,
  ) {
    const workflow = await this.prismaService.workflow.findFirst({
      where: {
        id: payload.workflowId,
        deletedAt: null,
      },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${payload.workflowId} not found`);
    }

    const existingTemplate = await this.prismaService.workflowTemplate.findFirst({
      where: {
        sourceWorkflowId: workflow.id,
        deletedAt: null,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const data = {
      slug: payload.slug.trim(),
      sourceWorkflowId: workflow.id,
      publisherId: currentUser.id,
      title: payload.title.trim(),
      description: payload.description.trim(),
      category: payload.category.trim(),
      tags: payload.tags as unknown as Prisma.InputJsonValue,
      definition: workflow.definition as Prisma.InputJsonValue,
      authorName: payload.authorName?.trim() || currentUser.name,
      published: payload.published ?? true,
      ...(existingTemplate
        ? {
            featured:
              payload.featured !== undefined
                ? payload.featured
                : existingTemplate.featured,
          }
        : {
            featured: payload.featured ?? false,
          }),
    };

    try {
      if (existingTemplate) {
        this.assertCanEditTemplate(existingTemplate, currentUser);
        return await this.prismaService.workflowTemplate.update({
          where: {
            id: existingTemplate.id,
          },
          data,
        });
      }

      return await this.prismaService.workflowTemplate.create({
        data,
      });
    } catch (error) {
      this.handleTemplateConflict(error);
      throw error;
    }
  }

  async updateTemplate(
    id: string,
    payload: UpdateTemplateDto,
    currentUser: AuthenticatedUser,
  ) {
    const existingTemplate = await this.prismaService.workflowTemplate.findUnique({
      where: { id },
    });

    if (!existingTemplate || existingTemplate.deletedAt) {
      throw new NotFoundException(`Template ${id} not found`);
    }

    this.assertCanEditTemplate(existingTemplate, currentUser);

    try {
      return await this.prismaService.workflowTemplate.update({
        where: { id },
        data: {
          ...(payload.slug !== undefined ? { slug: payload.slug.trim() } : {}),
          ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
          ...(payload.description !== undefined
            ? { description: payload.description.trim() }
            : {}),
          ...(payload.category !== undefined
            ? { category: payload.category.trim() }
            : {}),
          ...(payload.tags !== undefined
            ? { tags: payload.tags as unknown as Prisma.InputJsonValue }
            : {}),
          ...(payload.definition !== undefined
            ? {
                definition: payload.definition as unknown as Prisma.InputJsonValue,
              }
            : {}),
          ...(payload.authorName !== undefined
            ? { authorName: payload.authorName.trim() || 'CloudFlow 官方' }
            : {}),
          ...(payload.published !== undefined
            ? { published: payload.published }
            : {}),
          ...(payload.featured !== undefined
            ? { featured: payload.featured }
            : {}),
          ...(payload.rating !== undefined ? { rating: payload.rating } : {}),
        },
      });
    } catch (error) {
      this.handleTemplateConflict(error);
      throw error;
    }
  }

  private buildSystemConfigUpdateData(payload: UpdateSystemConfigDto) {
    const nextSecretKey = this.getSecretEnvelopeKey();
    const data: Prisma.SystemConfigUpdateInput = {
      ...(payload.platformName !== undefined
        ? { platformName: payload.platformName.trim() || 'CloudFlow' }
        : {}),
      ...(payload.supportEmail !== undefined
        ? { supportEmail: payload.supportEmail?.trim() || null }
        : {}),
      ...(payload.smtpHost !== undefined
        ? { smtpHost: payload.smtpHost?.trim() || null }
        : {}),
      ...(payload.smtpPort !== undefined ? { smtpPort: payload.smtpPort } : {}),
      ...(payload.smtpUser !== undefined
        ? { smtpUser: payload.smtpUser?.trim() || null }
        : {}),
      ...(payload.smtpPass !== undefined
        ? {
            smtpPass: payload.smtpPass?.trim()
              ? encryptSecretValue(payload.smtpPass.trim(), nextSecretKey)
              : null,
          }
        : {}),
      ...(payload.smtpSecure !== undefined
        ? { smtpSecure: payload.smtpSecure }
        : {}),
      ...(payload.smtpIgnoreTlsCertificate !== undefined
        ? {
            smtpIgnoreTlsCertificate: payload.smtpIgnoreTlsCertificate,
          }
        : {}),
      ...(payload.smtpFrom !== undefined
        ? { smtpFrom: payload.smtpFrom?.trim() || null }
        : {}),
      ...(payload.minioEndpoint !== undefined
        ? { minioEndpoint: payload.minioEndpoint?.trim() || null }
        : {}),
      ...(payload.minioPort !== undefined
        ? { minioPort: payload.minioPort }
        : {}),
      ...(payload.minioUseSSL !== undefined
        ? { minioUseSSL: payload.minioUseSSL }
        : {}),
      ...(payload.minioAccessKey !== undefined
        ? {
            minioAccessKey: payload.minioAccessKey?.trim()
              ? encryptSecretValue(payload.minioAccessKey.trim(), nextSecretKey)
              : null,
          }
        : {}),
      ...(payload.minioSecretKey !== undefined
        ? {
            minioSecretKey: payload.minioSecretKey?.trim()
              ? encryptSecretValue(payload.minioSecretKey.trim(), nextSecretKey)
              : null,
          }
        : {}),
      ...(payload.minioBucket !== undefined
        ? {
            minioBucket:
              payload.minioBucket?.trim() || 'cloudflow-task-artifacts',
          }
        : {}),
      ...(payload.screenshotIntervalMs !== undefined
        ? { screenshotIntervalMs: payload.screenshotIntervalMs }
        : {}),
      ...(payload.screenshotPersistIntervalMs !== undefined
        ? { screenshotPersistIntervalMs: payload.screenshotPersistIntervalMs }
        : {}),
      ...(payload.taskRetentionDays !== undefined
        ? { taskRetentionDays: payload.taskRetentionDays }
        : {}),
      ...(payload.monitorPageSize !== undefined
        ? { monitorPageSize: payload.monitorPageSize }
        : {}),
      ...(payload.globalTaskConcurrency !== undefined
        ? { globalTaskConcurrency: payload.globalTaskConcurrency }
        : {}),
      ...(payload.perUserTaskConcurrency !== undefined
        ? { perUserTaskConcurrency: payload.perUserTaskConcurrency }
        : {}),
      ...(payload.manualTaskPriority !== undefined
        ? { manualTaskPriority: payload.manualTaskPriority }
        : {}),
      ...(payload.scheduledTaskPriority !== undefined
        ? { scheduledTaskPriority: payload.scheduledTaskPriority }
        : {}),
    };

    return data;
  }

  private serializeSystemConfig(config: SystemConfig) {
    return {
      ...config,
      smtpPass: this.decryptOptionalSecret(config.smtpPass),
      minioAccessKey: this.decryptOptionalSecret(config.minioAccessKey),
      minioSecretKey: this.decryptOptionalSecret(config.minioSecretKey),
    };
  }

  private buildConfigAuditSnapshot(
    config: ReturnType<AdminService['serializeSystemConfig']>,
    changedFields: string[],
  ) {
    return Object.fromEntries(
      changedFields.map((field) => {
        const value = config[field as keyof typeof config];
        if (
          field === 'smtpPass' ||
          field === 'minioAccessKey' ||
          field === 'minioSecretKey'
        ) {
          return [field, value ? maskSecretValue(String(value)) : ''];
        }

        return [field, value ?? null];
      }),
    );
  }

  private decryptOptionalSecret(value?: string | null) {
    if (!value?.trim()) {
      return '';
    }

    return decryptSecretValue(value, this.getSecretEnvelopeKey());
  }

  private getSecretEnvelopeKey() {
    return this.configService.get<string>(
      'SECRET_ENCRYPTION_KEY',
      'cloudflow-dev-secret-key',
    );
  }

  private assertCanEditTemplate(
    template: {
      publisherId: string | null;
      title: string;
    },
    currentUser: AuthenticatedUser,
  ) {
    if (currentUser.isSuperAdmin) {
      return;
    }

    if (template.publisherId && template.publisherId === currentUser.id) {
      return;
    }

    throw new ForbiddenException(
      `你没有权限更新模板「${template.title}」。`,
    );
  }

  private handleTemplateConflict(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('模板 slug 已存在。');
    }
  }

  private isSuperAdminEmail(email: string) {
    const raw = this.configService.get<string>(
      'SUPER_ADMIN_EMAILS',
      'admin@cloudflow.local',
    );

    return raw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .includes(email.trim().toLowerCase());
  }

  private async ensureDefaultTemplates() {
    const total = await this.prismaService.workflowTemplate.count({
      where: {
        deletedAt: null,
      },
    });

    if (total > 0) {
      return;
    }

    for (const template of DEFAULT_WORKFLOW_TEMPLATES) {
      await this.prismaService.workflowTemplate.create({
        data: {
          slug: template.slug,
          title: template.title,
          description: template.description,
          category: template.category,
          tags: template.tags as unknown as Prisma.InputJsonValue,
          definition: template.definition as Prisma.InputJsonValue,
          authorName: template.authorName,
          published: template.published,
          featured: template.featured,
          installCount: template.installCount,
          rating: template.rating,
        },
      });
    }
  }

  private async ensureSystemConfig() {
    const existing = await this.prismaService.systemConfig.findFirst({
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (existing) {
      return existing;
    }

    return this.prismaService.systemConfig.create({
      data: {
        platformName: 'CloudFlow',
        globalTaskConcurrency: 2,
        perUserTaskConcurrency: 1,
        manualTaskPriority: 1,
        scheduledTaskPriority: 10,
      },
    });
  }

  private generateTemporaryPassword() {
    return randomBytes(6).toString('base64url');
  }

  private get userModel() {
    return this.prismaService.user;
  }
}
