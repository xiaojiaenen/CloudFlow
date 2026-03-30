import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdminService } from '../admin/admin.service';

@Injectable()
export class StoreService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly adminService: AdminService,
  ) {}

  async listTemplates(search?: string, category?: string) {
    await this.adminService.listTemplates();

    return this.prismaService.workflowTemplate.findMany({
      where: {
        deletedAt: null,
        published: true,
        ...(search?.trim()
          ? {
              OR: [
                {
                  title: {
                    contains: search.trim(),
                  },
                },
                {
                  description: {
                    contains: search.trim(),
                  },
                },
              ],
            }
          : {}),
        ...(category?.trim()
          ? {
              category: category.trim(),
            }
          : {}),
      },
      orderBy: [{ featured: 'desc' }, { installCount: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async markInstalled(id: string) {
    return this.prismaService.workflowTemplate.update({
      where: { id },
      data: {
        installCount: {
          increment: 1,
        },
      },
    });
  }
}
