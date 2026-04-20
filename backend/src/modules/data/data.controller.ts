import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { DataService } from './data.service';

@UseGuards(AuthGuard)
@Controller('data')
export class DataController {
  constructor(private readonly dataService: DataService) {}

  @Get('collections')
  listCollections(
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @Query('search') search: string | undefined,
    @Query('workflowId') workflowId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.dataService.listCollections(
      { page, pageSize, search, workflowId },
      request.user,
    );
  }

  @Get('collections/:id')
  getCollection(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.dataService.getCollection(id, request.user);
  }

  @Get('collections/:id/records')
  listCollectionRecords(
    @Param('id') id: string,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @Query('search') search: string | undefined,
    @Query('workflowId') workflowId: string | undefined,
    @Query('taskId') taskId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.dataService.listCollectionRecords(
      id,
      { page, pageSize, search, workflowId, taskId },
      request.user,
    );
  }

  @Get('tasks/:taskId/batches')
  listTaskBatches(
    @Param('taskId') taskId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.dataService.listTaskBatches(taskId, request.user);
  }

  @Get('batches/:batchId/rows')
  listBatchRows(
    @Param('batchId') batchId: string,
    @Query('page') page: string | undefined,
    @Query('pageSize') pageSize: string | undefined,
    @Query('operation') operation: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.dataService.listBatchRows(
      batchId,
      { page, pageSize, operation },
      request.user,
    );
  }
}
