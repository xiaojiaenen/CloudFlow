import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CredentialService } from './credential.service';
import { UpsertCredentialDto } from './dto/upsert-credential.dto';

@UseGuards(AuthGuard)
@Controller('credentials')
export class CredentialController {
  constructor(private readonly credentialService: CredentialService) {}

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.credentialService.findAll(request.user);
  }

  @Post()
  create(
    @Body() payload: UpsertCredentialDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.credentialService.create(payload, request.user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() payload: UpsertCredentialDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.credentialService.update(id, payload, request.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.credentialService.remove(id, request.user);
  }
}
