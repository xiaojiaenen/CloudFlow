import {
  ForbiddenException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthUserRole, AuthUserStatus } from './auth.types';
import {
  buildStoredPasswordHash,
  signAuthToken,
  verifyAuthToken,
  verifyStoredPasswordHash,
} from './auth.utils';

type AuthTokenPayload = {
  sub: string;
  role: AuthUserRole;
  email: string;
  exp: number;
};

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultUsers();
  }

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.userModel.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (!user || !verifyStoredPasswordHash(password, user.passwordHash)) {
      throw new UnauthorizedException('邮箱或密码错误。');
    }

    if (user.status !== 'active') {
      throw new ForbiddenException('当前账号不可用，请联系管理员。');
    }

    const token = this.signToken({
      sub: user.id,
      role: user.role,
      email: user.email,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    });

    return {
      token,
      user: this.toClientUser(user),
    };
  }

  async getCurrentUserFromToken(token: string) {
    const payload = this.verifyToken(token);
    if (!payload) {
      throw new UnauthorizedException('登录状态已失效，请重新登录。');
    }

    if (payload.exp < Date.now()) {
      throw new UnauthorizedException('登录状态已过期，请重新登录。');
    }

    const user = await this.userModel.findUnique({
      where: {
        id: payload.sub,
      },
    });

    if (!user) {
      throw new UnauthorizedException('当前用户不存在。');
    }

    if (user.status !== 'active') {
      throw new ForbiddenException('当前账号不可用，请联系管理员。');
    }

    return this.toClientUser(user);
  }

  async listUsers() {
    await this.ensureDefaultUsers();
    const users = await this.userModel.findMany({
      orderBy: {
        createdAt: 'asc',
      },
    });

    return users.map((user) => this.toClientUser(user));
  }

  async ensureDefaultUsers() {
    const total = await this.prismaService.user.count();
    if (total > 0) {
      return;
    }

    const defaults: Array<{
      email: string;
      name: string;
      password: string;
      role: AuthUserRole;
      status?: AuthUserStatus;
    }> = [
      {
        email: 'admin@cloudflow.local',
        name: 'CloudFlow 管理员',
        password: 'Admin123456',
        role: 'admin',
      },
      {
        email: 'user@cloudflow.local',
        name: 'CloudFlow 普通用户',
        password: 'User123456',
        role: 'user',
      },
    ];

    for (const account of defaults) {
      const salt = randomBytes(16).toString('hex');
      await this.userModel.create({
        data: {
          email: account.email,
          name: account.name,
          role: account.role,
          status: account.status ?? 'active',
          passwordHash: buildStoredPasswordHash(account.password, salt),
        },
      });
    }
  }

  private signToken(payload: AuthTokenPayload) {
    return signAuthToken(payload, this.getTokenSecret());
  }

  private verifyToken(token: string) {
    return verifyAuthToken(token, this.getTokenSecret()) as AuthTokenPayload | null;
  }

  private getTokenSecret() {
    return this.configService.get<string>('AUTH_TOKEN_SECRET', 'cloudflow-dev-secret');
  }

  private toClientUser(user: {
    id: string;
    email: string;
    name: string;
    role: AuthUserRole;
    status: AuthUserStatus;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private get userModel() {
    return (this.prismaService as unknown as {
      user: {
        findUnique: (...args: any[]) => Promise<any>;
        findMany: (...args: any[]) => Promise<any[]>;
        count: (...args: any[]) => Promise<number>;
        create: (...args: any[]) => Promise<any>;
      };
    }).user;
  }
}
