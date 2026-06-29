import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { REMINDER_QUEUE, REMINDER_JOB } from './reminder.constants';
import type { NotificationChannelId, ReminderDto, ReminderStatus } from './publishing.types';
import {
  notFound,
  remindAtInPast,
  remindAtRequired,
  reminderAlreadySent,
} from '../common/errors/error-envelope';

interface CreateReminderInput {
  postId: string;
  channels?: NotificationChannelId[];
  remindAt?: string;
}

const DEFAULT_CHANNELS: NotificationChannelId[] = ['in_app', 'email'];

@Injectable()
export class ReminderService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(REMINDER_QUEUE) private readonly queue: Queue,
  ) {}

  async create(tenantId: string, dto: CreateReminderInput): Promise<ReminderDto[]> {
    const post = await this.prisma.post.findFirst({
      where: { id: dto.postId, tenantId },
    });
    if (!post) throw notFound();

    const remindAtRaw = dto.remindAt ?? post.scheduledAt?.toISOString();
    if (!remindAtRaw) throw remindAtRequired();
    const remindAt = new Date(remindAtRaw);
    const delay = remindAt.getTime() - Date.now();
    if (delay <= 0) throw remindAtInPast();

    const channels = dto.channels?.length ? dto.channels : DEFAULT_CHANNELS;
    const out: ReminderDto[] = [];
    for (const channel of channels) {
      const row = await this.prisma.reminder.create({
        data: { tenantId, postId: dto.postId, channel, remindAt, status: 'scheduled' },
      });
      await this.queue.add(
        REMINDER_JOB,
        { reminderId: row.id, postId: dto.postId, tenantId, channel },
        { delay, jobId: row.id },
      );
      const withJob = await this.prisma.reminder.update({
        where: { id: row.id },
        data: { jobId: row.id },
      });
      out.push(this.toDto(withJob));
    }
    return out;
  }

  async list(tenantId: string, postId: string): Promise<ReminderDto[]> {
    const rows = await this.prisma.reminder.findMany({
      where: { tenantId, postId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async cancel(tenantId: string, id: string): Promise<ReminderDto> {
    const existing = await this.prisma.reminder.findFirst({ where: { id, tenantId } });
    if (!existing) throw notFound();
    if (existing.status === 'sent') throw reminderAlreadySent();
    const updated = await this.prisma.reminder.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    await this.queue.remove(id);
    return this.toDto(updated);
  }

  private toDto(row: {
    id: string;
    tenantId: string;
    postId: string;
    channel: string;
    remindAt: Date;
    status: string;
    createdAt: Date;
  }): ReminderDto {
    return {
      id: row.id,
      tenantId: row.tenantId,
      postId: row.postId,
      channel: row.channel as NotificationChannelId,
      remindAt: row.remindAt.toISOString(),
      status: row.status as ReminderStatus,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
