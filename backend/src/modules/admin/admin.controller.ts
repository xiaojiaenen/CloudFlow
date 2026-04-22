import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminService } from './admin.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { PublishWorkflowTemplateDto } from './dto/publish-workflow-template.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { UpdateUserDto } from './dto/update-user.dto';

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

  @Post('users')
  createUser(@Body() payload: CreateUserDto) {
    return this.adminService.createUser(payload);
  }

  @Patch('users/:id')
  updateUser(
    @Param('id') id: string,
    @Body() payload: UpdateUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminService.updateUser(id, payload, request.user);
  }

  @Post('users/:id/reset-password')
  resetUserPassword(
    @Param('id') id: string,
    @Body() payload: ResetUserPasswordDto,
  ) {
    return this.adminService.resetUserPassword(id, payload);
  }

  @Delete('users/:id')
  deleteUser(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminService.deleteUser(id, request.user);
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
  updateSystemConfig(
    @Body() payload: UpdateSystemConfigDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminService.updateSystemConfig(payload, request.user);
  }

  @Post('system-config/test-smtp')
  testSmtpConnection(@Body() payload: UpdateSystemConfigDto) {
    return this.adminService.testSmtpConnection(payload);
  }

  @Post('system-config/test-minio')
  testMinioConnection(@Body() payload: UpdateSystemConfigDto) {
    return this.adminService.testMinioConnection(payload);
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
  createTemplate(
    @Body() payload: CreateTemplateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminService.createTemplate(payload, request.user);
  }

  @Post('templates/publish-from-workflow')
  publishTemplateFromWorkflow(
    @Body() payload: PublishWorkflowTemplateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminService.publishTemplateFromWorkflow(payload, request.user);
  }

  @Patch('templates/:id')
  updateTemplate(
    @Param('id') id: string,
    @Body() payload: UpdateTemplateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminService.updateTemplate(id, payload, request.user);
  }

  @Delete('templates/:id')
  deleteTemplate(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminService.deleteTemplate(id, request.user);
  }
}
