import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RunTaskDto } from './dto/run-task.dto';
import { TaskService } from './task.service';

@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post('run')
  run(@Body() runTaskDto: RunTaskDto) {
    return this.taskService.run(runTaskDto);
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('triggerSource') triggerSource?: string,
    @Query('workflowId') workflowId?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.taskService.findAll({
      page,
      pageSize,
      status,
      triggerSource,
      workflowId,
      activeOnly,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.taskService.findOne(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.taskService.cancel(id);
  }
}
