import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowService } from './workflow.service';

@UseGuards(AuthGuard)
@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post()
  create(
    @Body() createWorkflowDto: CreateWorkflowDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.workflowService.create(createWorkflowDto, request.user);
  }

  @Get()
  findAll(
    @Query('includeArchived') includeArchived?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Req() request?: AuthenticatedRequest,
  ) {
    return this.workflowService.findAll({
      includeArchived,
      status,
      search,
    }, request?.user);
  }

  @Get('schedules')
  findSchedules(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('lastStatus') lastStatus?: string,
    @Req() request?: AuthenticatedRequest,
  ) {
    return this.workflowService.findSchedules({
      page,
      pageSize,
      search,
      lastStatus,
    }, request?.user);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.workflowService.duplicate(id, request.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.workflowService.findOne(id, request.user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateWorkflowDto: UpdateWorkflowDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.workflowService.update(id, updateWorkflowDto, request.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.workflowService.remove(id, request.user);
  }
}
