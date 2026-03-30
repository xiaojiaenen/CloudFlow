import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TaskStatus, Workflow } from '@prisma/client';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private transporter: Transporter | null = null;
  private transporterInitialized = false;

  constructor(private readonly configService: ConfigService) {}

  async notifyTaskFinished(task: {
    id: string;
    status: TaskStatus;
    errorMessage?: string | null;
    createdAt: Date;
    startedAt?: Date | null;
    completedAt?: Date | null;
    workflow: Pick<
      Workflow,
      'id' | 'name' | 'alertEmail' | 'alertOnFailure' | 'alertOnSuccess'
    >;
  }) {
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

    const from =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('SMTP_USER') ||
      'cloudflow@localhost';

    const statusLabel = task.status === 'success' ? '执行成功' : '执行失败';
    const durationText = this.formatDuration(task.startedAt, task.completedAt);
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #111827;">
        <h2 style="margin-bottom: 12px;">CloudFlow 工作流通知</h2>
        <p>工作流 <strong>${this.escapeHtml(task.workflow.name)}</strong> ${statusLabel}。</p>
        <table style="border-collapse: collapse; margin-top: 16px;">
          <tr><td style="padding: 6px 12px 6px 0;">任务 ID</td><td><code>${this.escapeHtml(task.id)}</code></td></tr>
          <tr><td style="padding: 6px 12px 6px 0;">工作流 ID</td><td><code>${this.escapeHtml(task.workflow.id)}</code></td></tr>
          <tr><td style="padding: 6px 12px 6px 0;">执行状态</td><td>${statusLabel}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0;">创建时间</td><td>${task.createdAt.toLocaleString('zh-CN', { hour12: false })}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0;">开始时间</td><td>${task.startedAt ? task.startedAt.toLocaleString('zh-CN', { hour12: false }) : '--'}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0;">结束时间</td><td>${task.completedAt ? task.completedAt.toLocaleString('zh-CN', { hour12: false }) : '--'}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0;">运行耗时</td><td>${durationText}</td></tr>
        </table>
        ${
          task.errorMessage
            ? `<div style="margin-top: 18px; padding: 12px 14px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;">
                <strong>错误信息</strong>
                <div style="margin-top: 8px; white-space: pre-wrap;">${this.escapeHtml(task.errorMessage)}</div>
              </div>`
            : ''
        }
      </div>
    `;

    await transporter.sendMail({
      from,
      to: recipient,
      subject: `[CloudFlow] ${task.workflow.name} ${statusLabel}`,
      html,
      text: [
        'CloudFlow 工作流通知',
        `工作流：${task.workflow.name}`,
        `任务 ID：${task.id}`,
        `状态：${statusLabel}`,
        `创建时间：${task.createdAt.toLocaleString('zh-CN', { hour12: false })}`,
        `开始时间：${task.startedAt ? task.startedAt.toLocaleString('zh-CN', { hour12: false }) : '--'}`,
        `结束时间：${task.completedAt ? task.completedAt.toLocaleString('zh-CN', { hour12: false }) : '--'}`,
        `运行耗时：${durationText}`,
        task.errorMessage ? `错误信息：${task.errorMessage}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  private async getTransporter() {
    if (this.transporterInitialized) {
      return this.transporter;
    }

    this.transporterInitialized = true;

    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') || 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    const secure = this.configService.get<string>('SMTP_SECURE') === 'true';

    if (!host || !user || !pass) {
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });

    return this.transporter;
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

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
