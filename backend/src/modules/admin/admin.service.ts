import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueueService } from 'src/queue/queue.service';
import { DEFAULT_WORKFLOW_TEMPLATES } from '../store/default-templates';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService,
  ) {}

  async getOverview() {
    await this.ensureDefaultTemplates();

    const [workflowGroups, templateTotal, publishedTemplates, scheduledWorkflows, taskTotal, totalUsers] =
      await Promise.all([
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
            '统一规划用户权限边界与平台运营策略',
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
        ...(payload.smtpSecure !== undefined
          ? { smtpSecure: payload.smtpSecure }
          : {}),
        ...(payload.smtpFrom !== undefined
          ? { smtpFrom: payload.smtpFrom?.trim() || null }
          : {}),
        ...(payload.screenshotIntervalMs !== undefined
          ? { screenshotIntervalMs: payload.screenshotIntervalMs }
          : {}),
        ...(payload.taskRetentionDays !== undefined
          ? { taskRetentionDays: payload.taskRetentionDays }
          : {}),
        ...(payload.monitorPageSize !== undefined
          ? { monitorPageSize: payload.monitorPageSize }
          : {}),
      },
    });
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

  async updateTemplate(id: string, payload: UpdateTemplateDto) {
    return this.prismaService.workflowTemplate.update({
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
          ? { definition: payload.definition as Prisma.InputJsonValue }
          : {}),
        ...(payload.authorName !== undefined
          ? { authorName: payload.authorName.trim() || 'CloudFlow 官方' }
          : {}),
        ...(payload.published !== undefined
          ? { published: payload.published }
          : {}),
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
      },
    });
  }

  private get userModel() {
    return (this.prismaService as unknown as {
      user: {
        count: (...args: any[]) => Promise<number>;
        findMany: (...args: any[]) => Promise<any[]>;
      };
    }).user;
  }
}
