import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowService } from './workflow.service';

@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post()
  create(@Body() createWorkflowDto: CreateWorkflowDto) {
    return this.workflowService.create(createWorkflowDto);
  }

  @Get()
  findAll(
    @Query('includeArchived') includeArchived?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.workflowService.findAll({
      includeArchived,
      status,
      search,
    });
  }

  @Get('schedules')
  findSchedules(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('lastStatus') lastStatus?: string,
  ) {
    return this.workflowService.findSchedules({
      page,
      pageSize,
      search,
      lastStatus,
    });
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string) {
    return this.workflowService.duplicate(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workflowService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateWorkflowDto: UpdateWorkflowDto) {
    return this.workflowService.update(id, updateWorkflowDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workflowService.remove(id);
  }
}
