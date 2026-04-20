import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { PickTaskElementDto } from './dto/pick-task-element.dto';
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
    @Query('search') search?: string,
    @Req() request?: AuthenticatedRequest,
  ) {
    return this.taskService.findAll({
      page,
      pageSize,
      status,
      triggerSource,
      workflowId,
      activeOnly,
      search,
    }, request?.user);
  }

  @Get('summary')
  summary(
    @Query('status') status?: string,
    @Query('triggerSource') triggerSource?: string,
    @Query('workflowId') workflowId?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('search') search?: string,
    @Req() request?: AuthenticatedRequest,
  ) {
    return this.taskService.getSummary(
      {
        status,
        triggerSource,
        workflowId,
        activeOnly,
        search,
      },
      request?.user,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.taskService.findOne(id, request.user);
  }

  @Get(':id/screenshots/:eventId')
  async screenshot(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    const asset = await this.taskService.getScreenshotAsset(
      id,
      eventId,
      request.user,
    );

    response.setHeader('Content-Type', asset.mimeType);
    response.setHeader('Cache-Control', 'private, max-age=60');
    response.send(asset.buffer);
  }

  @Post(':id/pick-element')
  pickElement(
    @Param('id') id: string,
    @Body() payload: PickTaskElementDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.taskService.pickElement(id, payload, request.user);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.taskService.cancel(id, request.user);
  }

  @Post(':id/retry')
  retry(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.taskService.retry(id, request.user);
  }
}
