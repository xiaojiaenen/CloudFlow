import { Body, Controller, Get, Param, Patch, Post, Query, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminService } from './admin.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  getOverview() {
    return this.adminService.getOverview();
  }

  @Get('users')
  getUsers() {
    return this.adminService.listUsers();
  }

  @Get('health')
  getHealth() {
    return this.adminService.getHealth();
  }

  @Get('system-config')
  getSystemConfig() {
    return this.adminService.getSystemConfig();
  }

  @Put('system-config')
  updateSystemConfig(@Body() payload: UpdateSystemConfigDto) {
    return this.adminService.updateSystemConfig(payload);
  }

  @Get('templates')
  listTemplates(
    @Query('search') search?: string,
    @Query('published') published?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.adminService.listTemplates({
      search,
      published,
      includeDeleted,
    });
  }

  @Post('templates')
  createTemplate(@Body() payload: CreateTemplateDto) {
    return this.adminService.createTemplate(payload);
  }

  @Patch('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() payload: UpdateTemplateDto) {
    return this.adminService.updateTemplate(id, payload);
  }
}
