import { Controller, Get, Query } from '@nestjs/common';
import { AlertService } from './alert.service';

@Controller('alerts')
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('level') level?: string,
  ) {
    return this.alertService.findAll({
      page,
      pageSize,
      level,
    });
  }
}
