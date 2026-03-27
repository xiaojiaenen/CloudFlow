import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WorkflowDefinition } from 'src/common/types/workflow.types';
import { PrismaService } from 'src/prisma/prisma.service';
import { QueueService } from 'src/queue/queue.service';
import { RunTaskDto } from './dto/run-task.dto';

@Injectable()
export class TaskService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async run(runTaskDto: RunTaskDto) {
    const workflow = await this.prismaService.workflow.findUnique({
      where: {
        id: runTaskDto.workflowId,
      },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${runTaskDto.workflowId} not found`);
    }

    const task = await this.prismaService.task.create({
      data: {
        workflowId: workflow.id,
        status: 'pending',
        workflowSnapshot: workflow.definition as Prisma.InputJsonValue,
      },
      include: {
        workflow: true,
      },
    });

    await this.queueService.enqueueTask({
      taskId: task.id,
      workflow: workflow.definition as unknown as WorkflowDefinition,
    });

    return task;
  }

  async findOne(id: string) {
    const task = await this.prismaService.task.findUnique({
      where: { id },
      include: {
        workflow: true,
      },
    });

    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }

    return task;
  }
}
