import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TaskStatus, Workflow } from '@prisma/client';
import nodemailer, { Transporter } from 'nodemailer';
import { decryptSecretValue } from 'src/common/utils/secret-envelope';
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
    'id' | 'name' | 'alertEmail' | 'alertOnFailure' | 'alertOnSuccess'
  >;
  totalEvents: number;
  screenshotCount: number;
  extractCount: number;
  recentActivities: RecentActivityItem[];
  extractSummaries: ExtractSummaryItem[];
}

type SmtpOverrideConfig = {
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPass?: string | null;
  smtpSecure?: boolean | null;
  smtpIgnoreTlsCertificate?: boolean | null;
};

type ResolvedSmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
  ignoreTlsCertificate: boolean;
};

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
        `SMTP not configured, skipped task alert email for task ${task.id}.`,
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

  async testSmtpConnection(overrides?: SmtpOverrideConfig) {
    const config = await this.resolveSmtpConfig(overrides);
    const transporter = nodemailer.createTransport(
      this.buildTransportOptions(config),
    );

    try {
      await transporter.verify();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('unable to verify the first certificate')) {
        throw new BadRequestException(
          'SMTP certificate verification failed. Enable the TLS certificate bypass option only in trusted internal environments.',
        );
      }

      throw error;
    }

    return {
      host: config.host,
      port: config.port,
      secure: config.secure,
      ignoreTlsCertificate: config.ignoreTlsCertificate,
    };
  }

  private async loadTaskDetail(
    taskId: string,
  ): Promise<NotificationTaskDetail | null> {
    const [
      task,
      totalEvents,
      screenshotCount,
      extractCount,
      recentActivities,
      extractSummaries,
    ] = await Promise.all([
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
              '[empty]',
            createdAt: item.createdAt,
          };
        }),
    };
  }

  private buildHtml(task: NotificationTaskDetail) {
    const statusMeta = this.getStatusMeta(task.status);
    const monitorUrl = this.getMonitorUrl(task.id);
    const activityRows = task.recentActivities.length
      ? task.recentActivities.map((item) => this.renderActivityRow(item)).join('')
      : `<tr><td style="padding:12px 16px;color:#64748b;">No recent activity captured.</td></tr>`;
    const extractRows = task.extractSummaries.length
      ? task.extractSummaries.map((item) => this.renderExtractRow(item)).join('')
      : `<tr><td style="padding:12px 16px;color:#64748b;">No extract results captured.</td></tr>`;

    return `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>CloudFlow Task Notification</title>
        </head>
        <body style="margin:0;padding:24px;background:#0f172a;color:#e2e8f0;font-family:Arial,sans-serif;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;background:${statusMeta.bannerBackground};color:#ffffff;">
                <div style="font-size:12px;letter-spacing:.08em;opacity:.85;">CLOUDFLOW</div>
                <div style="margin-top:10px;font-size:28px;font-weight:700;">${this.escapeHtml(task.workflow.name)}</div>
                <div style="margin-top:8px;font-size:14px;line-height:1.6;">${this.escapeHtml(statusMeta.summary)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px;">
                <div style="font-size:16px;font-weight:700;margin-bottom:12px;">Task Summary</div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  ${this.renderSummaryRow('Task ID', task.id)}
                  ${this.renderSummaryRow('Workflow ID', task.workflow.id)}
                  ${this.renderSummaryRow('Status', statusMeta.label)}
                  ${this.renderSummaryRow('Created At', this.formatDateTime(task.createdAt))}
                  ${this.renderSummaryRow('Started At', this.formatDateTime(task.startedAt))}
                  ${this.renderSummaryRow('Completed At', this.formatDateTime(task.completedAt))}
                  ${this.renderSummaryRow('Duration', this.formatDuration(task.startedAt, task.completedAt))}
                  ${this.renderSummaryRow('Node Count', String(this.getWorkflowNodeCount(task.workflowSnapshot)))}
                  ${this.renderSummaryRow('Events', String(task.totalEvents))}
                  ${this.renderSummaryRow('Screenshots', String(task.screenshotCount))}
                  ${this.renderSummaryRow('Extract Results', String(task.extractCount))}
                </table>
              </td>
            </tr>
            ${
              task.errorMessage
                ? `<tr><td style="padding:0 28px 20px 28px;"><div style="padding:14px 16px;border:1px solid #7f1d1d;border-radius:12px;background:#450a0a;color:#fecaca;white-space:pre-wrap;">${this.escapeHtml(task.errorMessage)}</div></td></tr>`
                : ''
            }
            <tr>
              <td style="padding:0 28px 20px 28px;">
                <div style="font-size:16px;font-weight:700;margin-bottom:12px;">Recent Activity</div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #1f2937;border-radius:12px;overflow:hidden;background:#0b1220;">
                  ${activityRows}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px 28px;">
                <div style="font-size:16px;font-weight:700;margin-bottom:12px;">Extract Preview</div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #1f2937;border-radius:12px;overflow:hidden;background:#0b1220;">
                  ${extractRows}
                </table>
              </td>
            </tr>
            ${
              monitorUrl
                ? `<tr><td style="padding:0 28px 28px 28px;"><a href="${this.escapeHtml(monitorUrl)}" style="display:inline-block;padding:12px 16px;border-radius:10px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;">Open Monitor Center</a></td></tr>`
                : ''
            }
          </table>
        </body>
      </html>
    `;
  }

  private buildText(task: NotificationTaskDetail) {
    const statusMeta = this.getStatusMeta(task.status);
    const lines = [
      'CloudFlow Task Notification',
      '',
      `${task.workflow.name} - ${statusMeta.label}`,
      statusMeta.summary,
      '',
      `Task ID: ${task.id}`,
      `Workflow ID: ${task.workflow.id}`,
      `Created At: ${this.formatDateTime(task.createdAt)}`,
      `Started At: ${this.formatDateTime(task.startedAt)}`,
      `Completed At: ${this.formatDateTime(task.completedAt)}`,
      `Duration: ${this.formatDuration(task.startedAt, task.completedAt)}`,
      `Node Count: ${this.getWorkflowNodeCount(task.workflowSnapshot)}`,
      `Events: ${task.totalEvents}`,
      `Screenshots: ${task.screenshotCount}`,
      `Extract Results: ${task.extractCount}`,
    ];

    if (task.errorMessage) {
      lines.push('', `Error: ${task.errorMessage}`);
    }

    if (task.recentActivities.length > 0) {
      lines.push('', 'Recent Activity:');
      for (const item of task.recentActivities) {
        const description =
          item.type === 'status'
            ? `Status -> ${this.getStatusMeta(item.status ?? 'pending').label}`
            : item.message || 'Execution log';
        lines.push(`- [${this.formatDateTime(item.createdAt)}] ${description}`);
      }
    }

    if (task.extractSummaries.length > 0) {
      lines.push('', 'Extract Preview:');
      for (const item of task.extractSummaries) {
        lines.push(`- ${item.selector} (${item.property}): ${item.preview}`);
      }
    }

    const monitorUrl = this.getMonitorUrl(task.id);
    if (monitorUrl) {
      lines.push('', `Monitor: ${monitorUrl}`);
    }

    return lines.join('\n');
  }

  private renderSummaryRow(label: string, value: string) {
    return `<tr>
      <td style="padding:8px 0;width:140px;color:#94a3b8;font-size:13px;vertical-align:top;">${this.escapeHtml(label)}</td>
      <td style="padding:8px 0;color:#e2e8f0;font-size:13px;vertical-align:top;">${this.escapeHtml(value)}</td>
    </tr>`;
  }

  private renderActivityRow(item: RecentActivityItem) {
    const description =
      item.type === 'status'
        ? `Status changed to ${this.getStatusMeta(item.status ?? 'pending').label}`
        : item.message || 'Execution log';

    return `<tr>
      <td style="padding:12px 16px;border-top:1px solid #1f2937;color:#cbd5e1;font-size:13px;">
        <div style="font-weight:700;">#${item.sequence}</div>
        <div style="margin-top:4px;color:#64748b;">${this.escapeHtml(this.formatDateTime(item.createdAt))}</div>
        <div style="margin-top:8px;line-height:1.6;">${this.escapeHtml(description)}</div>
        ${
          item.nodeId
            ? `<div style="margin-top:6px;color:#64748b;">Node: ${this.escapeHtml(item.nodeId)}</div>`
            : ''
        }
      </td>
    </tr>`;
  }

  private renderExtractRow(item: ExtractSummaryItem) {
    return `<tr>
      <td style="padding:12px 16px;border-top:1px solid #1f2937;color:#cbd5e1;font-size:13px;">
        <div style="font-weight:700;">#${item.sequence} · ${this.escapeHtml(item.selector)}</div>
        <div style="margin-top:4px;color:#64748b;">Property: ${this.escapeHtml(item.property)}</div>
        ${
          item.nodeId
            ? `<div style="margin-top:4px;color:#64748b;">Node: ${this.escapeHtml(item.nodeId)}</div>`
            : ''
        }
        <div style="margin-top:8px;line-height:1.6;white-space:pre-wrap;">${this.escapeHtml(item.preview)}</div>
      </td>
    </tr>`;
  }

  private async getTransporter() {
    let config: ResolvedSmtpConfig;

    try {
      config = await this.resolveSmtpConfig();
    } catch (error) {
      if (error instanceof BadRequestException) {
        this.transporter = null;
        this.transporterSignature = null;
        return null;
      }

      throw error;
    }

    const signature = [
      config.host,
      config.port,
      config.user,
      config.pass,
      config.secure,
      config.ignoreTlsCertificate,
    ].join('|');

    if (!this.transporter || this.transporterSignature !== signature) {
      this.transporter = nodemailer.createTransport(
        this.buildTransportOptions(config),
      );
      this.transporterSignature = signature;
    }

    return this.transporter;
  }

  private async resolveSmtpConfig(
    overrides?: SmtpOverrideConfig,
  ): Promise<ResolvedSmtpConfig> {
    const systemConfig = await this.prismaService.systemConfig.findFirst({
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const host = this.pickString(
      overrides?.smtpHost,
      systemConfig?.smtpHost,
      this.configService.get<string>('SMTP_HOST'),
    );
    const user = this.pickString(
      overrides?.smtpUser,
      systemConfig?.smtpUser,
      this.configService.get<string>('SMTP_USER'),
    );
    const pass = this.pickString(
      overrides?.smtpPass,
      this.decryptOptionalSecret(systemConfig?.smtpPass),
      this.configService.get<string>('SMTP_PASS'),
    );
    const port =
      overrides?.smtpPort ??
      systemConfig?.smtpPort ??
      Number(this.configService.get<string>('SMTP_PORT') || 587);
    const secure =
      overrides?.smtpSecure ??
      systemConfig?.smtpSecure ??
      (this.configService.get<string>('SMTP_SECURE') === 'true');
    const ignoreTlsCertificate =
      overrides?.smtpIgnoreTlsCertificate ??
      systemConfig?.smtpIgnoreTlsCertificate ??
      (this.configService.get<string>('SMTP_IGNORE_TLS_CERTIFICATE') === 'true');

    if (!host || !user || !pass) {
      throw new BadRequestException(
        'SMTP host, username and password are required before testing or sending email.',
      );
    }

    return {
      host,
      port,
      user,
      pass,
      secure,
      ignoreTlsCertificate,
    };
  }

  private buildTransportOptions(config: ResolvedSmtpConfig) {
    return {
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      tls: config.ignoreTlsCertificate
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
    };
  }

  private pickString(...values: Array<string | null | undefined>) {
    for (const value of values) {
      if (typeof value !== 'string') {
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

  private getStatusMeta(status: TaskStatus) {
    switch (status) {
      case 'success':
        return {
          label: 'Success',
          summary: 'The workflow finished successfully.',
          bannerBackground: '#166534',
        };
      case 'failed':
        return {
          label: 'Failed',
          summary: 'The workflow failed during execution. Review the activity log and error details.',
          bannerBackground: '#991b1b',
        };
      case 'cancelled':
        return {
          label: 'Cancelled',
          summary: 'The workflow was cancelled before completion.',
          bannerBackground: '#92400e',
        };
      case 'running':
        return {
          label: 'Running',
          summary: 'The workflow is currently executing.',
          bannerBackground: '#1d4ed8',
        };
      default:
        return {
          label: 'Pending',
          summary: 'The workflow is queued and waiting for execution.',
          bannerBackground: '#475569',
        };
    }
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
