import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  TaskStatus,
  Workflow,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { PrismaService } from 'src/prisma/prisma.service';

interface RecentActivityItem {
  id: string;
  sequence: number;
  type: 'log' | 'status';
  level?: string | null;
  status?: TaskStatus | null;
  message?: string | null;
  nodeId?: string | null;
  createdAt: Date;
}

interface ExtractSummaryItem {
  id: string;
  sequence: number;
  nodeId?: string | null;
  selector: string;
  property: string;
  preview: string;
  createdAt: Date;
}

interface NotificationTaskDetail {
  id: string;
  status: TaskStatus;
  errorMessage?: string | null;
  createdAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
  workflowSnapshot: Prisma.JsonValue;
  workflow: Pick<
    Workflow,
    | 'id'
    | 'name'
    | 'alertEmail'
    | 'alertOnFailure'
    | 'alertOnSuccess'
  >;
  totalEvents: number;
  screenshotCount: number;
  extractCount: number;
  recentActivities: RecentActivityItem[];
  extractSummaries: ExtractSummaryItem[];
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private transporter: Transporter | null = null;
  private transporterSignature: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {}

  async notifyTaskFinished(taskId: string) {
    const task = await this.loadTaskDetail(taskId);
    if (!task) {
      return;
    }

    const recipient = task.workflow.alertEmail?.trim();
    if (!recipient) {
      return;
    }

    const shouldSend =
      (task.status === 'failed' && task.workflow.alertOnFailure) ||
      (task.status === 'success' && task.workflow.alertOnSuccess);

    if (!shouldSend) {
      return;
    }

    const transporter = await this.getTransporter();
    if (!transporter) {
      this.logger.warn(
        `SMTP not configured, skipped email alert for task ${task.id}.`,
      );
      return;
    }

    const systemConfig = await this.prismaService.systemConfig.findFirst({
      orderBy: {
        updatedAt: 'desc',
      },
    });
    const from =
      systemConfig?.smtpFrom ||
      this.configService.get<string>('SMTP_FROM') ||
      systemConfig?.smtpUser ||
      this.configService.get<string>('SMTP_USER') ||
      'cloudflow@localhost';

    const statusMeta = this.getStatusMeta(task.status);

    await transporter.sendMail({
      from,
      to: recipient,
      subject: `[CloudFlow] ${task.workflow.name} ${statusMeta.label}`,
      html: this.buildHtml(task),
      text: this.buildText(task),
    });
  }

  private async loadTaskDetail(taskId: string): Promise<NotificationTaskDetail | null> {
    const [task, totalEvents, screenshotCount, extractCount, recentActivities, extractSummaries] =
      await Promise.all([
        this.prismaService.task.findUnique({
          where: { id: taskId },
          select: {
            id: true,
            status: true,
            errorMessage: true,
            createdAt: true,
            startedAt: true,
            completedAt: true,
            workflowSnapshot: true,
            workflow: {
              select: {
                id: true,
                name: true,
                alertEmail: true,
                alertOnFailure: true,
                alertOnSuccess: true,
              },
            },
          },
        }),
        this.prismaService.taskExecutionEvent.count({
          where: { taskId },
        }),
        this.prismaService.taskExecutionEvent.count({
          where: { taskId, type: 'screenshot' },
        }),
        this.prismaService.taskExecutionEvent.count({
          where: { taskId, type: 'extract' },
        }),
        this.prismaService.taskExecutionEvent.findMany({
          where: {
            taskId,
            type: {
              in: ['log', 'status'],
            },
          },
          orderBy: [{ sequence: 'desc' }],
          take: 8,
          select: {
            id: true,
            sequence: true,
            type: true,
            level: true,
            status: true,
            message: true,
            nodeId: true,
            createdAt: true,
          },
        }),
        this.prismaService.taskExecutionEvent.findMany({
          where: {
            taskId,
            type: 'extract',
          },
          orderBy: [{ sequence: 'desc' }],
          take: 3,
          select: {
            id: true,
            sequence: true,
            nodeId: true,
            payload: true,
            message: true,
            createdAt: true,
          },
        }),
      ]);

    if (!task) {
      return null;
    }

    return {
      ...task,
      totalEvents,
      screenshotCount,
      extractCount,
      recentActivities: recentActivities
        .slice()
        .reverse()
        .map((item) => ({
          ...item,
          type: item.type as 'log' | 'status',
        })),
      extractSummaries: extractSummaries
        .slice()
        .reverse()
        .map((item) => {
          const payload = this.toObjectPayload(item.payload);
          return {
            id: item.id,
            sequence: item.sequence,
            nodeId: item.nodeId,
            selector: this.readPayloadString(payload, 'selector') || '--',
            property: this.readPayloadString(payload, 'property') || 'text',
            preview:
              this.readPayloadString(payload, 'preview') ||
              item.message ||
              '[空值]',
            createdAt: item.createdAt,
          };
        }),
    };
  }

  private buildHtml(task: NotificationTaskDetail) {
    const statusMeta = this.getStatusMeta(task.status);
    const nodeCount = this.getWorkflowNodeCount(task.workflowSnapshot);
    const durationText = this.formatDuration(task.startedAt, task.completedAt);
    const monitorUrl = this.getMonitorUrl(task.id);
    const activityRows = task.recentActivities.length
      ? task.recentActivities
          .map((item) => this.renderActivityRow(item))
          .join('')
      : `<tr>
          <td colspan="3" style="padding: 16px 18px; color: #94a3b8; font-size: 13px;">
            暂无可展示的执行活动。
          </td>
        </tr>`;

    const extractCards = task.extractSummaries.length
      ? task.extractSummaries.map((item) => this.renderExtractCard(item)).join('')
      : `<tr>
          <td style="padding: 0 0 16px 0;">
            <div style="border: 1px dashed #334155; border-radius: 16px; padding: 18px; color: #94a3b8; font-size: 13px; background: #0f172a;">
              本次任务没有提取节点结果。
            </div>
          </td>
        </tr>`;

    const ctaBlock = monitorUrl
      ? `<tr>
          <td style="padding: 0 32px 28px 32px;">
            <a href="${this.escapeHtml(monitorUrl)}" style="display: inline-block; background: ${statusMeta.buttonBackground}; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 12px; font-size: 14px; font-weight: 700;">
              打开监控中心查看详情
            </a>
          </td>
        </tr>`
      : '';

    return `
      <!doctype html>
      <html lang="zh-CN">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>CloudFlow 工作流通知</title>
        </head>
        <body style="margin: 0; padding: 0; background: #060816; font-family: Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif; color: #e2e8f0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #060816; padding: 24px 12px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 720px; background: #0b1120; border: 1px solid #1e293b; border-radius: 24px; overflow: hidden;">
                  <tr>
                    <td style="padding: 0;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: ${statusMeta.heroBackground}; background-image: linear-gradient(135deg, ${statusMeta.heroGradientStart}, ${statusMeta.heroGradientEnd});">
                        <tr>
                          <td style="padding: 28px 32px 24px 32px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                              <tr>
                                <td align="left">
                                  <div style="display: inline-block; padding: 6px 12px; border-radius: 999px; background: rgba(255,255,255,0.14); color: #ffffff; font-size: 12px; font-weight: 700; letter-spacing: 0.08em;">
                                    CLOUDFLOW AUTOMATION
                                  </div>
                                  <div style="margin-top: 18px; font-size: 30px; line-height: 1.2; font-weight: 800; color: #ffffff;">
                                    ${this.escapeHtml(task.workflow.name)}
                                  </div>
                                  <div style="margin-top: 10px; font-size: 15px; line-height: 1.7; color: rgba(255,255,255,0.86); max-width: 560px;">
                                    ${statusMeta.summary}
                                  </div>
                                </td>
                                <td align="right" valign="top" style="padding-left: 16px;">
                                  <div style="display: inline-block; padding: 8px 14px; border-radius: 999px; background: rgba(255,255,255,0.18); color: #ffffff; font-size: 13px; font-weight: 700;">
                                    ${statusMeta.label}
                                  </div>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding: 24px 32px 8px 32px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          ${this.renderStatCard('任务状态', statusMeta.label, statusMeta.statAccent)}
                          ${this.renderStatCard('运行耗时', durationText, '#38bdf8')}
                          ${this.renderStatCard('节点数量', String(nodeCount), '#a78bfa')}
                          ${this.renderStatCard('执行事件', String(task.totalEvents), '#f59e0b')}
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding: 8px 32px 0 32px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #0f172a; border: 1px solid #1e293b; border-radius: 18px;">
                        <tr>
                          <td style="padding: 20px 22px;">
                            <div style="font-size: 14px; font-weight: 700; color: #f8fafc; margin-bottom: 14px;">任务摘要</div>
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                              ${this.renderSummaryRow('任务 ID', task.id)}
                              ${this.renderSummaryRow('工作流 ID', task.workflow.id)}
                              ${this.renderSummaryRow('创建时间', this.formatDateTime(task.createdAt))}
                              ${this.renderSummaryRow('开始时间', this.formatDateTime(task.startedAt))}
                              ${this.renderSummaryRow('结束时间', this.formatDateTime(task.completedAt))}
                              ${this.renderSummaryRow('截图数量', `${task.screenshotCount} 张`)}
                              ${this.renderSummaryRow('提取结果', `${task.extractCount} 条`)}
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  ${
                    task.errorMessage
                      ? `<tr>
                          <td style="padding: 20px 32px 0 32px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #3f0d16; border: 1px solid #7f1d1d; border-radius: 18px;">
                              <tr>
                                <td style="padding: 18px 20px;">
                                  <div style="font-size: 14px; font-weight: 700; color: #fecaca; margin-bottom: 10px;">错误信息</div>
                                  <div style="font-size: 13px; line-height: 1.8; color: #fee2e2; white-space: pre-wrap;">${this.escapeHtml(task.errorMessage)}</div>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>`
                      : ''
                  }

                  <tr>
                    <td style="padding: 20px 32px 0 32px;">
                      <div style="font-size: 15px; font-weight: 700; color: #f8fafc; margin-bottom: 12px;">最近执行活动</div>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #0f172a; border: 1px solid #1e293b; border-radius: 18px; overflow: hidden;">
                        ${activityRows}
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding: 20px 32px 0 32px;">
                      <div style="font-size: 15px; font-weight: 700; color: #f8fafc; margin-bottom: 12px;">提取结果速览</div>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        ${extractCards}
                      </table>
                    </td>
                  </tr>

                  ${ctaBlock}

                  <tr>
                    <td style="padding: 0 32px 28px 32px;">
                      <div style="border-top: 1px solid #1e293b; padding-top: 18px; color: #64748b; font-size: 12px; line-height: 1.8;">
                        这是一封由 CloudFlow 自动发送的工作流通知邮件。<br />
                        如果你希望收到更多任务明细，可以继续扩展监控中心和告警规则。
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  private buildText(task: NotificationTaskDetail) {
    const statusMeta = this.getStatusMeta(task.status);
    const nodeCount = this.getWorkflowNodeCount(task.workflowSnapshot);
    const durationText = this.formatDuration(task.startedAt, task.completedAt);
    const activityLines = task.recentActivities.length
      ? task.recentActivities.map((item) => {
          const label =
            item.type === 'status'
              ? `状态更新为 ${this.getStatusMeta(item.status ?? 'pending').label}`
              : item.message || '执行日志';
          return `- [${this.formatDateTime(item.createdAt)}] ${label}`;
        })
      : ['- 暂无可展示的执行活动'];

    const extractLines = task.extractSummaries.length
      ? task.extractSummaries.map(
          (item) =>
            `- ${item.selector} (${item.property}) => ${item.preview}`,
        )
      : ['- 本次任务没有提取节点结果'];

    const lines = [
      'CloudFlow 工作流通知',
      '',
      `${task.workflow.name} ${statusMeta.label}`,
      statusMeta.summary,
      '',
      `任务 ID：${task.id}`,
      `工作流 ID：${task.workflow.id}`,
      `创建时间：${this.formatDateTime(task.createdAt)}`,
      `开始时间：${this.formatDateTime(task.startedAt)}`,
      `结束时间：${this.formatDateTime(task.completedAt)}`,
      `运行耗时：${durationText}`,
      `节点数量：${nodeCount}`,
      `执行事件：${task.totalEvents}`,
      `截图数量：${task.screenshotCount}`,
      `提取结果：${task.extractCount}`,
      '',
      '最近执行活动：',
      ...activityLines,
      '',
      '提取结果速览：',
      ...extractLines,
    ];

    if (task.errorMessage) {
      lines.push('', `错误信息：${task.errorMessage}`);
    }

    const monitorUrl = this.getMonitorUrl(task.id);
    if (monitorUrl) {
      lines.push('', `监控中心：${monitorUrl}`);
    }

    return lines.join('\n');
  }

  private renderStatCard(label: string, value: string, accent: string) {
    return `<td width="25%" style="padding: 0 8px 16px 0;">
      <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 18px; padding: 18px 16px;">
        <div style="font-size: 12px; color: #94a3b8; margin-bottom: 10px;">${this.escapeHtml(label)}</div>
        <div style="font-size: 24px; line-height: 1.2; font-weight: 800; color: #f8fafc;">${this.escapeHtml(value)}</div>
        <div style="margin-top: 12px; width: 42px; height: 4px; border-radius: 999px; background: ${accent};"></div>
      </div>
    </td>`;
  }

  private renderSummaryRow(label: string, value: string) {
    return `<tr>
      <td style="padding: 8px 0; width: 108px; color: #94a3b8; font-size: 13px; vertical-align: top;">${this.escapeHtml(label)}</td>
      <td style="padding: 8px 0; color: #e2e8f0; font-size: 13px; vertical-align: top;">${this.escapeHtml(value)}</td>
    </tr>`;
  }

  private renderActivityRow(item: RecentActivityItem) {
    const accent =
      item.type === 'status'
        ? this.getStatusMeta(item.status ?? 'pending')
        : this.getLogMeta(item.level);
    const description =
      item.type === 'status'
        ? `状态更新为 ${this.getStatusMeta(item.status ?? 'pending').label}`
        : item.message || '执行日志';

    return `<tr>
      <td style="padding: 14px 16px 14px 18px; width: 120px; color: #94a3b8; font-size: 12px; vertical-align: top; border-bottom: 1px solid #172033;">
        #${item.sequence}<br />
        <span style="display: inline-block; margin-top: 4px;">${this.escapeHtml(this.formatDateTime(item.createdAt))}</span>
      </td>
      <td style="padding: 14px 12px; vertical-align: top; border-bottom: 1px solid #172033;">
        <div style="font-size: 13px; color: #e2e8f0; line-height: 1.7;">${this.escapeHtml(description)}</div>
        ${
          item.nodeId
            ? `<div style="margin-top: 6px; font-size: 11px; color: #64748b;">节点 ID: <code>${this.escapeHtml(item.nodeId)}</code></div>`
            : ''
        }
      </td>
      <td style="padding: 14px 18px 14px 12px; width: 120px; vertical-align: top; border-bottom: 1px solid #172033;" align="right">
        <span style="display: inline-block; padding: 6px 10px; border-radius: 999px; background: ${accent.background}; color: ${accent.color}; font-size: 12px; font-weight: 700;">
          ${this.escapeHtml(accent.label)}
        </span>
      </td>
    </tr>`;
  }

  private renderExtractCard(item: ExtractSummaryItem) {
    return `<tr>
      <td style="padding: 0 0 16px 0;">
        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 18px; padding: 18px 18px 16px 18px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 13px; font-weight: 700; color: #f8fafc;">提取节点 #${item.sequence}</span>
            <span style="font-size: 11px; color: #94a3b8;">${this.escapeHtml(this.formatDateTime(item.createdAt))}</span>
          </div>
          <div style="font-size: 12px; color: #94a3b8; line-height: 1.8;">
            选择器: <code style="color: #e2e8f0;">${this.escapeHtml(item.selector)}</code><br />
            属性: <code style="color: #e2e8f0;">${this.escapeHtml(item.property)}</code>
            ${
              item.nodeId
                ? `<br />节点 ID: <code style="color: #e2e8f0;">${this.escapeHtml(item.nodeId)}</code>`
                : ''
            }
          </div>
          <div style="margin-top: 12px; background: #020617; border: 1px solid #1e293b; border-radius: 12px; padding: 12px 14px; font-size: 12px; line-height: 1.8; color: #cbd5e1; white-space: pre-wrap;">
            ${this.escapeHtml(item.preview)}
          </div>
        </div>
      </td>
    </tr>`;
  }

  private async getTransporter() {
    const systemConfig = await this.prismaService.systemConfig.findFirst({
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const host =
      systemConfig?.smtpHost || this.configService.get<string>('SMTP_HOST');
    const port =
      systemConfig?.smtpPort ||
      Number(this.configService.get<string>('SMTP_PORT') || 587);
    const user =
      systemConfig?.smtpUser || this.configService.get<string>('SMTP_USER');
    const pass =
      systemConfig?.smtpPass || this.configService.get<string>('SMTP_PASS');
    const secure =
      systemConfig?.smtpSecure ??
      (this.configService.get<string>('SMTP_SECURE') === 'true');
    const signature = [host, port, user, pass, secure].join('|');

    if (!host || !user || !pass) {
      this.transporter = null;
      this.transporterSignature = null;
      return null;
    }

    if (!this.transporter || this.transporterSignature !== signature) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
      });
      this.transporterSignature = signature;
    }

    return this.transporter;
  }

  private getStatusMeta(status: TaskStatus) {
    if (status === 'success') {
      return {
        label: '执行成功',
        summary:
          '自动化流程已经顺利跑完，关键步骤全部完成，可以直接进入监控中心继续复盘执行结果。',
        heroBackground: '#0f3b2f',
        heroGradientStart: '#0f766e',
        heroGradientEnd: '#14532d',
        statAccent: '#34d399',
        buttonBackground: '#10b981',
        background: '#073b2f',
        color: '#bbf7d0',
      };
    }

    return {
      label: '执行失败',
      summary:
        '自动化流程在执行过程中遇到了异常，建议尽快查看错误信息和最近执行活动，确认失败节点与页面状态。',
      heroBackground: '#4c0519',
      heroGradientStart: '#7f1d1d',
      heroGradientEnd: '#581c87',
      statAccent: '#fb7185',
      buttonBackground: '#e11d48',
      background: '#450a0a',
      color: '#fecdd3',
    };
  }

  private getLogMeta(level?: string | null) {
    if (level === 'success') {
      return {
        label: '成功日志',
        background: '#083344',
        color: '#67e8f9',
      };
    }

    if (level === 'warn') {
      return {
        label: '警告日志',
        background: '#3f2b0a',
        color: '#fcd34d',
      };
    }

    if (level === 'error') {
      return {
        label: '错误日志',
        background: '#3f0d16',
        color: '#fda4af',
      };
    }

    return {
      label: '执行日志',
      background: '#0f172a',
      color: '#93c5fd',
    };
  }

  private getWorkflowNodeCount(workflowSnapshot: Prisma.JsonValue) {
    if (
      workflowSnapshot &&
      typeof workflowSnapshot === 'object' &&
      !Array.isArray(workflowSnapshot) &&
      Array.isArray((workflowSnapshot as Record<string, unknown>).nodes)
    ) {
      return ((workflowSnapshot as Record<string, unknown>).nodes as unknown[])
        .length;
    }

    return 0;
  }

  private toObjectPayload(payload: Prisma.JsonValue | null) {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload as Record<string, Prisma.JsonValue>;
    }

    return {};
  }

  private readPayloadString(
    payload: Record<string, Prisma.JsonValue>,
    key: string,
  ) {
    const value = payload[key];
    return typeof value === 'string' ? value : '';
  }

  private formatDuration(startedAt?: Date | null, completedAt?: Date | null) {
    if (!startedAt) {
      return '--';
    }

    const end = completedAt?.getTime() ?? Date.now();
    const totalSeconds = Math.max(
      0,
      Math.floor((end - startedAt.getTime()) / 1000),
    );
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(
      2,
      '0',
    );
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  private formatDateTime(value?: Date | null) {
    if (!value) {
      return '--';
    }

    return value.toLocaleString('zh-CN', {
      hour12: false,
    });
  }

  private getMonitorUrl(taskId: string) {
    const baseUrl =
      this.configService.get<string>('APP_BASE_URL') ||
      this.configService.get<string>('FRONTEND_BASE_URL');

    if (!baseUrl) {
      return '';
    }

    return `${baseUrl.replace(/\/$/, '')}/monitor?taskId=${encodeURIComponent(taskId)}`;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
