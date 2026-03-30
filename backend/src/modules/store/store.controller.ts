import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { StoreService } from './store.service';

@Controller('store')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get('templates')
  listTemplates(
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    return this.storeService.listTemplates(search, category);
  }

  @Post('templates/:id/install')
  markInstalled(@Param('id') id: string) {
    return this.storeService.markInstalled(id);
  }
}
