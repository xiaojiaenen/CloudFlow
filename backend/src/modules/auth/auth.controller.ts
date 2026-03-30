import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() payload: LoginDto) {
    return this.authService.login(payload.email, payload.password);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() request: { user: unknown }) {
    return request.user;
  }
}
