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

type SystemBranding = {
  platformName: string;
  supportEmail: string;
  from: string;
  baseUrl: string;
  logoUrl: string;
};

type EmailHighlight = {
  label: string;
  value: string;
  mono?: boolean;
};

type EmailSection = {
  title: string;
  lines: string[];
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

    const branding = await this.getSystemBranding();
    const statusMeta = this.getStatusMeta(task.status);

    await transporter.sendMail({
      from: branding.from,
      to: recipient,
      subject: `[${branding.platformName}] 工作流《${task.workflow.name}》${statusMeta.label}`,
      html: this.buildTaskAlertHtml(task, branding),
      text: this.buildTaskAlertText(task, branding),
    });
  }

  async sendWelcomeEmail(params: {
    email: string;
    name: string;
    role: string;
    password: string;
  }) {
    const transporter = await this.getTransporter();
    if (!transporter) {
      return false;
    }

    const branding = await this.getSystemBranding();
    const loginUrl = this.getLoginUrl();
    const roleLabel = params.role === 'admin' ? '管理员' : '普通用户';

    await transporter.sendMail({
      from: branding.from,
      to: params.email,
      subject: `[${branding.platformName}] 欢迎加入 ${branding.platformName}`,
      html: this.buildSystemEmailHtml({
        branding,
        badge: '欢迎邮件',
        eyebrow: '账号已开通',
        title: `欢迎加入 ${branding.platformName}`,
        summary:
          '管理员已经为你创建了账号，下面是本次开通的登录信息。建议首次登录后尽快修改密码。',
        accent: '#0ea5e9',
        highlights: [
          { label: '登录邮箱', value: params.email },
          { label: '初始密码', value: params.password, mono: true },
          { label: '角色', value: roleLabel },
        ],
        sections: [
          {
            title: '使用建议',
            lines: [
              `${params.name || params.email}，欢迎进入 ${branding.platformName}。`,
              '首次登录后建议立即前往个人中心修改密码与昵称。',
            ],
          },
        ],
        ctaLabel: loginUrl ? '立即登录' : undefined,
        ctaUrl: loginUrl || undefined,
        footerNote: branding.supportEmail
          ? `如遇登录问题，请联系 ${branding.supportEmail}`
          : '如遇登录问题，请联系平台管理员。',
      }),
      text: [
        `${branding.platformName} 欢迎邮件`,
        '',
        `登录邮箱：${params.email}`,
        `初始密码：${params.password}`,
        `角色：${roleLabel}`,
        '',
        '首次登录后请尽快修改密码。',
        loginUrl ? `登录地址：${loginUrl}` : '',
        branding.supportEmail ? `支持邮箱：${branding.supportEmail}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });

    return true;
  }

  async sendPasswordResetEmail(params: {
    email: string;
    name: string;
    password: string;
  }) {
    const transporter = await this.getTransporter();
    if (!transporter) {
      return false;
    }

    const branding = await this.getSystemBranding();
    const loginUrl = this.getLoginUrl();

    await transporter.sendMail({
      from: branding.from,
      to: params.email,
      subject: `[${branding.platformName}] 你的密码已重置`,
      html: this.buildSystemEmailHtml({
        branding,
        badge: '安全通知',
        eyebrow: '密码已更新',
        title: '你的登录密码已重置',
        summary:
          '管理员已经为你的账号生成新的临时密码，请尽快登录并修改为你自己的密码。',
        accent: '#f59e0b',
        highlights: [
          { label: '登录邮箱', value: params.email },
          { label: '临时密码', value: params.password, mono: true },
          { label: '处理时间', value: this.formatDateTime(new Date()) },
        ],
        sections: [
          {
            title: '安全提醒',
            lines: [
              `${params.name || params.email}，请不要把临时密码转发给其他人。`,
              '如非本人操作，请尽快联系管理员确认账号安全。',
            ],
          },
        ],
        ctaLabel: loginUrl ? '前往登录' : undefined,
        ctaUrl: loginUrl || undefined,
        footerNote: branding.supportEmail
          ? `如需协助，请联系 ${branding.supportEmail}`
          : '如需协助，请联系平台管理员。',
      }),
      text: [
        `${branding.platformName} 密码重置通知`,
        '',
        `登录邮箱：${params.email}`,
        `临时密码：${params.password}`,
        `处理时间：${this.formatDateTime(new Date())}`,
        '',
        '请尽快登录并修改密码。',
        loginUrl ? `登录地址：${loginUrl}` : '',
        branding.supportEmail ? `支持邮箱：${branding.supportEmail}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });

    return true;
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

  private async getSystemBranding(): Promise<SystemBranding> {
    const systemConfig = await this.prismaService.systemConfig.findFirst({
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const baseUrl = this.getBaseUrl();
    return {
      platformName:
        systemConfig?.platformName?.trim() ||
        this.configService.get<string>('PLATFORM_NAME') ||
        'CloudFlow',
      supportEmail:
        systemConfig?.supportEmail?.trim() ||
        this.configService.get<string>('SUPPORT_EMAIL') ||
        '',
      from:
        systemConfig?.smtpFrom ||
        this.configService.get<string>('SMTP_FROM') ||
        systemConfig?.smtpUser ||
        this.configService.get<string>('SMTP_USER') ||
        'cloudflow@localhost',
      baseUrl,
      logoUrl: baseUrl ? `${baseUrl}/cloudflow-logo.svg` : '',
    };
  }

  private buildTaskAlertHtml(
    task: NotificationTaskDetail,
    branding: SystemBranding,
  ) {
    const statusMeta = this.getStatusMeta(task.status);
    const sections: EmailSection[] = [
      {
        title: '执行摘要',
        lines: [
          `任务编号：${task.id}`,
          `工作流编号：${task.workflow.id}`,
          `执行状态：${statusMeta.label}`,
          `创建时间：${this.formatDateTime(task.createdAt)}`,
          `开始时间：${this.formatDateTime(task.startedAt)}`,
          `完成时间：${this.formatDateTime(task.completedAt)}`,
          `执行耗时：${this.formatDuration(task.startedAt, task.completedAt)}`,
          `节点数：${this.getWorkflowNodeCount(task.workflowSnapshot)}`,
          `事件数：${task.totalEvents}，截图 ${task.screenshotCount}，提取 ${task.extractCount}`,
        ],
      },
    ];

    if (task.errorMessage) {
      sections.push({
        title: '异常说明',
        lines: [task.errorMessage],
      });
    }

    sections.push({
      title: '最近动态',
      lines:
        task.recentActivities.length > 0
          ? task.recentActivities.map((item) =>
              item.type === 'status'
                ? `${this.formatDateTime(item.createdAt)} · 状态切换为 ${this.getStatusMeta(item.status ?? 'pending').label}`
                : `${this.formatDateTime(item.createdAt)} · ${item.message || '执行日志'}${
                    item.nodeId ? ` · 节点 ${item.nodeId}` : ''
                  }`,
            )
          : ['本次没有捕获到新的执行日志。'],
    });

    sections.push({
      title: '提取结果预览',
      lines:
        task.extractSummaries.length > 0
          ? task.extractSummaries.map(
              (item) => `${item.selector} · ${item.property} · ${item.preview}`,
            )
          : ['本次没有提取结果。'],
    });

    return this.buildSystemEmailHtml({
      branding,
      badge: '任务通知',
      eyebrow: '工作流执行回执',
      title: `《${task.workflow.name}》${statusMeta.label}`,
      summary: statusMeta.summary,
      accent: statusMeta.bannerBackground,
      highlights: [
        { label: '工作流', value: task.workflow.name },
        { label: '状态', value: statusMeta.label },
        {
          label: '执行耗时',
          value: this.formatDuration(task.startedAt, task.completedAt),
        },
      ],
      sections,
      ctaLabel: this.getMonitorUrl(task.id) ? '查看监控中心' : undefined,
      ctaUrl: this.getMonitorUrl(task.id) || undefined,
      footerNote: branding.supportEmail
        ? `如需协助，请联系 ${branding.supportEmail}`
        : '如需协助，请联系平台管理员。',
    });
  }

  private buildTaskAlertText(
    task: NotificationTaskDetail,
    branding: SystemBranding,
  ) {
    const statusMeta = this.getStatusMeta(task.status);
    const lines = [
      `${branding.platformName} 任务通知`,
      '',
      `${task.workflow.name} - ${statusMeta.label}`,
      statusMeta.summary,
      '',
      `任务编号：${task.id}`,
      `工作流编号：${task.workflow.id}`,
      `创建时间：${this.formatDateTime(task.createdAt)}`,
      `开始时间：${this.formatDateTime(task.startedAt)}`,
      `完成时间：${this.formatDateTime(task.completedAt)}`,
      `执行耗时：${this.formatDuration(task.startedAt, task.completedAt)}`,
      `节点数：${this.getWorkflowNodeCount(task.workflowSnapshot)}`,
      `事件数：${task.totalEvents}`,
      `截图数：${task.screenshotCount}`,
      `提取结果：${task.extractCount}`,
    ];

    if (task.errorMessage) {
      lines.push('', `异常说明：${task.errorMessage}`);
    }

    if (task.recentActivities.length > 0) {
      lines.push('', '最近动态：');
      for (const item of task.recentActivities) {
        const description =
          item.type === 'status'
            ? `状态切换为 ${this.getStatusMeta(item.status ?? 'pending').label}`
            : item.message || '执行日志';
        lines.push(`- [${this.formatDateTime(item.createdAt)}] ${description}`);
      }
    }

    if (task.extractSummaries.length > 0) {
      lines.push('', '提取结果预览：');
      for (const item of task.extractSummaries) {
        lines.push(`- ${item.selector} (${item.property})：${item.preview}`);
      }
    }

    const monitorUrl = this.getMonitorUrl(task.id);
    if (monitorUrl) {
      lines.push('', `监控地址：${monitorUrl}`);
    }

    return lines.join('\n');
  }

  private buildSystemEmailHtml(params: {
    branding: SystemBranding;
    badge: string;
    eyebrow: string;
    title: string;
    summary: string;
    accent: string;
    highlights: EmailHighlight[];
    sections: EmailSection[];
    ctaLabel?: string;
    ctaUrl?: string;
    footerNote?: string;
  }) {
    const logoHtml = params.branding.logoUrl
      ? `<img src="${this.escapeHtml(params.branding.logoUrl)}" alt="${this.escapeHtml(
          params.branding.platformName,
        )}" width="42" height="42" style="display:block;width:42px;height:42px;border-radius:12px;" />`
      : `<div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#38bdf8,#2dd4bf 60%,#a3e635);"></div>`;

    const highlightHtml = params.highlights
      .map(
        (item) => `
          <td style="padding:0 10px 10px 0;vertical-align:top;">
            <div style="min-width:160px;border:1px solid rgba(148,163,184,0.14);border-radius:16px;background:#09101d;padding:14px 16px;">
              <div style="font-size:12px;color:#94a3b8;">${this.escapeHtml(item.label)}</div>
              <div style="margin-top:8px;font-size:14px;font-weight:700;color:#f8fafc;${
                item.mono ? 'font-family:Consolas,Monaco,monospace;' : ''
              }">${this.escapeHtml(item.value)}</div>
            </div>
          </td>`,
      )
      .join('');

    const sectionHtml = params.sections
      .map(
        (section) => `
          <tr>
            <td style="padding:0 28px 18px 28px;">
              <div style="border:1px solid rgba(148,163,184,0.12);border-radius:18px;background:#09101d;padding:18px;">
                <div style="font-size:15px;font-weight:700;color:#ffffff;margin-bottom:10px;">${this.escapeHtml(section.title)}</div>
                ${section.lines
                  .map(
                    (line) =>
                      `<div style="margin-bottom:10px;font-size:13px;line-height:1.7;color:#cbd5e1;white-space:pre-wrap;">${this.escapeHtml(
                        line,
                      )}</div>`,
                  )
                  .join('')}
              </div>
            </td>
          </tr>`,
      )
      .join('');

    return `
      <!doctype html>
      <html lang="zh-CN">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${this.escapeHtml(params.title)}</title>
        </head>
        <body style="margin:0;padding:24px;background:#050816;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;margin:0 auto;border-radius:24px;overflow:hidden;background:#0f172a;border:1px solid rgba(148,163,184,0.16);box-shadow:0 24px 80px rgba(2,6,23,0.48);">
            <tr>
              <td style="padding:26px 28px;background:linear-gradient(135deg,${params.accent},#0f172a 62%,#020617 100%);">
                <div style="display:flex;align-items:center;gap:12px;">${logoHtml}</div>
                <div style="margin-top:16px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,0.82);">${this.escapeHtml(
                  params.badge,
                )}</div>
                <div style="margin-top:10px;font-size:13px;color:rgba(255,255,255,0.76);">${this.escapeHtml(
                  params.eyebrow,
                )}</div>
                <div style="margin-top:8px;font-size:28px;line-height:1.3;font-weight:800;color:#ffffff;">${this.escapeHtml(
                  params.title,
                )}</div>
                <div style="margin-top:10px;max-width:560px;font-size:14px;line-height:1.8;color:rgba(255,255,255,0.9);">${this.escapeHtml(
                  params.summary,
                )}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px 12px 28px;">
                <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">${this.escapeHtml(
                  params.branding.platformName,
                )}</div>
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>${highlightHtml}</tr>
                </table>
              </td>
            </tr>
            ${sectionHtml}
            ${
              params.ctaLabel && params.ctaUrl
                ? `<tr>
                    <td style="padding:0 28px 24px 28px;">
                      <a href="${this.escapeHtml(params.ctaUrl)}" style="display:inline-block;border-radius:14px;background:linear-gradient(135deg,#38bdf8,#2563eb);padding:12px 18px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">
                        ${this.escapeHtml(params.ctaLabel)}
                      </a>
                    </td>
                  </tr>`
                : ''
            }
            <tr>
              <td style="padding:0 28px 28px 28px;">
                <div style="border-top:1px solid rgba(148,163,184,0.14);padding-top:16px;font-size:12px;line-height:1.7;color:#94a3b8;">
                  ${this.escapeHtml(
                    params.footerNote ||
                      `${params.branding.platformName} 自动通知，请勿直接回复此邮件。`,
                  )}
                </div>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
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
          label: '执行成功',
          summary:
            '工作流已经顺利执行完成，结果与日志可以在监控中心继续查看。',
          bannerBackground: '#059669',
        };
      case 'failed':
        return {
          label: '执行失败',
          summary:
            '工作流在执行过程中发生异常，建议尽快查看错误原因与最近活动。',
          bannerBackground: '#dc2626',
        };
      case 'cancelled':
        return {
          label: '已取消',
          summary: '工作流在完成前被手动取消，当前任务已经安全停止。',
          bannerBackground: '#d97706',
        };
      case 'running':
        return {
          label: '执行中',
          summary: '工作流正在运行中。',
          bannerBackground: '#2563eb',
        };
      default:
        return {
          label: '等待执行',
          summary: '工作流已进入队列，正在等待执行。',
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

  private getBaseUrl() {
    const baseUrl =
      this.configService.get<string>('APP_BASE_URL') ||
      this.configService.get<string>('FRONTEND_BASE_URL') ||
      '';

    if (!baseUrl) {
      return '';
    }

    return baseUrl.replace(/\/$/, '');
  }

  private getMonitorUrl(taskId: string) {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      return '';
    }

    return `${baseUrl}/monitor?taskId=${encodeURIComponent(taskId)}`;
  }

  private getLoginUrl() {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      return '';
    }

    return `${baseUrl}/login`;
  }

  private escapeHtml(value: string) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
