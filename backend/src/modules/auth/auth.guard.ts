import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authorizationHeader = request.headers.authorization as string | undefined;
    const queryToken =
      typeof request.query?.accessToken === 'string'
        ? request.query.accessToken
        : '';
    const token = authorizationHeader?.startsWith('Bearer ')
      ? authorizationHeader.slice(7)
      : queryToken;

    if (!token) {
      throw new UnauthorizedException('请先登录。');
    }

    const user = await this.authService.getCurrentUserFromToken(token);
    request.user = user;
    return true;
  }
}
