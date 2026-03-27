import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RunTaskDto } from './dto/run-task.dto';
import { TaskService } from './task.service';

@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post('run')
  run(@Body() runTaskDto: RunTaskDto) {
    return this.taskService.run(runTaskDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.taskService.findOne(id);
  }
}
