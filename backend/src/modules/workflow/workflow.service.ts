import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';

@Injectable()
export class WorkflowService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createWorkflowDto: CreateWorkflowDto) {
    return this.prismaService.workflow.create({
      data: {
        name: createWorkflowDto.name,
        description: createWorkflowDto.description,
        definition: createWorkflowDto.definition as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findAll() {
    return this.prismaService.workflow.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const workflow = await this.prismaService.workflow.findUnique({
      where: { id },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    return workflow;
  }
}
