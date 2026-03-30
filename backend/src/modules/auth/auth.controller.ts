import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthGuard } from './auth.guard';
import { AuthenticatedRequest } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() payload: LoginDto) {
    return this.authService.login(payload.email, payload.password);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return request.user;
  }

  @UseGuards(AuthGuard)
  @Patch('me')
  updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() payload: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(request.user, payload.name);
  }

  @UseGuards(AuthGuard)
  @Post('change-password')
  changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() payload: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      request.user,
      payload.currentPassword,
      payload.newPassword,
    );
  }
}
