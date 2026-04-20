import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CreateRecorderSessionDto } from './dto/create-recorder-session.dto';
import { FinishRecorderSessionDto } from './dto/finish-recorder-session.dto';
import { RecorderClickDto } from './dto/recorder-click.dto';
import { RecorderInputDto } from './dto/recorder-input.dto';
import { RecorderNavigateDto } from './dto/recorder-navigate.dto';
import { RecorderPressKeyDto } from './dto/recorder-press-key.dto';
import { RecorderScrollDto } from './dto/recorder-scroll.dto';
import { RecorderService } from './recorder.service';

@UseGuards(AuthGuard)
@Controller('recorder')
export class RecorderController {
  constructor(private readonly recorderService: RecorderService) {}

  @Post('sessions')
  createSession(
    @Body() payload: CreateRecorderSessionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recorderService.createSession(payload, request.user);
  }

  @Get('sessions/:id')
  getSession(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recorderService.getSession(id, request.user);
  }

  @Post('sessions/:id/navigate')
  navigate(
    @Param('id') id: string,
    @Body() payload: RecorderNavigateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recorderService.navigate(id, payload, request.user);
  }

  @Post('sessions/:id/click')
  click(
    @Param('id') id: string,
    @Body() payload: RecorderClickDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recorderService.click(id, payload, request.user);
  }

  @Post('sessions/:id/input')
  input(
    @Param('id') id: string,
    @Body() payload: RecorderInputDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recorderService.input(id, payload, request.user);
  }

  @Post('sessions/:id/press-key')
  pressKey(
    @Param('id') id: string,
    @Body() payload: RecorderPressKeyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recorderService.pressKey(id, payload, request.user);
  }

  @Post('sessions/:id/scroll')
  scroll(
    @Param('id') id: string,
    @Body() payload: RecorderScrollDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recorderService.scroll(id, payload, request.user);
  }

  @Post('sessions/:id/finish')
  finish(
    @Param('id') id: string,
    @Body() payload: FinishRecorderSessionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recorderService.finish(id, payload, request.user);
  }

  @Delete('sessions/:id')
  close(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.recorderService.close(id, request.user);
  }
}
