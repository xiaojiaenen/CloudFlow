import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { AlertService } from './alert.service';

@UseGuards(AuthGuard)
@Controller('alerts')
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('level') level?: string,
    @Req() request?: AuthenticatedRequest,
  ) {
    return this.alertService.findAll({
      page,
      pageSize,
      level,
    }, request?.user);
  }
}
