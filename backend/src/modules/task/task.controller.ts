import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { RunTaskDto } from './dto/run-task.dto';
import { TaskService } from './task.service';

@UseGuards(AuthGuard)
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post('run')
  run(@Body() runTaskDto: RunTaskDto, @Req() request: AuthenticatedRequest) {
    return this.taskService.run(runTaskDto, request.user);
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('triggerSource') triggerSource?: string,
    @Query('workflowId') workflowId?: string,
    @Query('activeOnly') activeOnly?: string,
    @Req() request?: AuthenticatedRequest,
  ) {
    return this.taskService.findAll({
      page,
      pageSize,
      status,
      triggerSource,
      workflowId,
      activeOnly,
    }, request?.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.taskService.findOne(id, request.user);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.taskService.cancel(id, request.user);
  }
}
