import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueueService } from 'src/queue/queue.service';
import { buildStoredPasswordHash } from '../auth/auth.utils';
import { AuthenticatedUser, AuthUserRole, AuthUserStatus } from '../auth/auth.types';
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
          summary: '专注于创建、执行和维护自己的自动化工作流。',
          capabilities: [
            '创建、重命名、复制、归档自己的工作流',
            '编辑节点、运行任务、查看日志和截图',
            '启用定时调度、配置邮件告警',
            '从工作流商店导入已发布模板',
            '查看自己的任务历史、告警与执行详情',
          ],
        },
        {
          key: 'admin',
          name: '管理员',
          summary: '负责平台稳定性、模板生态和系统级配置。',
          capabilities: [
            '拥有普通用户全部能力',
            '管理所有工作流模板的发布、下架、分类和推荐位',
            '维护 SMTP、截图间隔、监控分页等系统参数',
            '查看数据库、Redis、队列等平台健康状态',
            '管理用户账号、停用账号并重置密码',
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
    return this.userModel.findMany({
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

    return user;
  }

  async updateUser(id: string, payload: UpdateUserDto, currentUser: AuthenticatedUser) {
    const user = await this.userModel.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    if (user.id === currentUser.id && payload.status === 'suspended') {
      throw new BadRequestException('不能停用当前登录的管理员账号。');
    }

    return this.userModel.update({
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
  }

  async resetUserPassword(id: string, payload: ResetUserPasswordDto) {
    const user = await this.userModel.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    const nextPassword = payload.newPassword?.trim() || this.generateTemporaryPassword();
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
    return this.ensureSystemConfig();
  }

  async updateSystemConfig(payload: UpdateSystemConfigDto) {
    const config = await this.ensureSystemConfig();

    return this.prismaService.systemConfig.update({
      where: {
        id: config.id,
      },
      data: {
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
          ? { smtpPass: payload.smtpPass?.trim() || null }
          : {}),
        ...(payload.smtpSecure !== undefined ? { smtpSecure: payload.smtpSecure } : {}),
        ...(payload.smtpFrom !== undefined
          ? { smtpFrom: payload.smtpFrom?.trim() || null }
          : {}),
        ...(payload.minioEndpoint !== undefined
          ? { minioEndpoint: payload.minioEndpoint?.trim() || null }
          : {}),
        ...(payload.minioPort !== undefined ? { minioPort: payload.minioPort } : {}),
        ...(payload.minioUseSSL !== undefined ? { minioUseSSL: payload.minioUseSSL } : {}),
        ...(payload.minioAccessKey !== undefined
          ? { minioAccessKey: payload.minioAccessKey?.trim() || null }
          : {}),
        ...(payload.minioSecretKey !== undefined
          ? { minioSecretKey: payload.minioSecretKey?.trim() || null }
          : {}),
        ...(payload.minioBucket !== undefined
          ? { minioBucket: payload.minioBucket?.trim() || 'cloudflow-task-artifacts' }
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
      },
    });
  }

  async testSmtpConnection(payload: UpdateSystemConfigDto) {
    try {
      const result = await this.notificationService.testSmtpConnection({
        smtpHost: payload.smtpHost,
        smtpPort: payload.smtpPort,
        smtpUser: payload.smtpUser,
        smtpPass: payload.smtpPass,
        smtpSecure: payload.smtpSecure,
      });

      return {
        success: true,
        message: `SMTP 连接成功：${result.host}:${result.port}${result.secure ? '（SSL/TLS）' : ''}`,
        ...result,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        error instanceof Error
          ? `SMTP 连接测试失败：${error.message}`
          : 'SMTP 连接测试失败，请检查主机、端口、账号和密码。',
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
          ? `MinIO 连接成功，bucket "${result.bucket}" 可用。`
          : `MinIO 连接成功，但 bucket "${result.bucket}" 当前不存在。`,
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
      ...(filters?.includeDeleted === 'true'
        ? {}
        : {
            deletedAt: null,
          }),
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

  async createTemplate(payload: CreateTemplateDto) {
    return this.prismaService.workflowTemplate.create({
      data: {
        slug: payload.slug.trim(),
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

    return this.prismaService.workflowTemplate.create({
      data: {
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
        featured: payload.featured ?? false,
      },
    });
  }

  async updateTemplate(id: string, payload: UpdateTemplateDto) {
    return this.prismaService.workflowTemplate.update({
      where: { id },
      data: {
        ...(payload.slug !== undefined ? { slug: payload.slug.trim() } : {}),
        ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
        ...(payload.description !== undefined
          ? { description: payload.description.trim() }
          : {}),
        ...(payload.category !== undefined ? { category: payload.category.trim() } : {}),
        ...(payload.tags !== undefined
          ? { tags: payload.tags as unknown as Prisma.InputJsonValue }
          : {}),
        ...(payload.definition !== undefined
          ? { definition: payload.definition as unknown as Prisma.InputJsonValue }
          : {}),
        ...(payload.authorName !== undefined
          ? { authorName: payload.authorName.trim() || 'CloudFlow 官方' }
          : {}),
        ...(payload.published !== undefined ? { published: payload.published } : {}),
        ...(payload.featured !== undefined ? { featured: payload.featured } : {}),
        ...(payload.rating !== undefined ? { rating: payload.rating } : {}),
      },
    });
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
    return (this.prismaService as unknown as {
      user: {
        count: (...args: any[]) => Promise<number>;
        findMany: (...args: any[]) => Promise<any[]>;
        findUnique: (...args: any[]) => Promise<any>;
        create: (...args: any[]) => Promise<any>;
        update: (...args: any[]) => Promise<any>;
      };
    }).user;
  }
}
