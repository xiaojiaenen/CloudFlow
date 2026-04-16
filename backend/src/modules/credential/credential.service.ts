import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { UpsertCredentialDto } from './dto/upsert-credential.dto';

@Injectable()
export class CredentialService {
  constructor(private readonly prismaService: PrismaService) {}

  async findAll(currentUser: AuthenticatedUser) {
    const credentials = await this.prismaService.credential.findMany({
      where: {
        ownerId: currentUser.id,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return credentials.map((credential) => this.serializeCredential(credential));
  }

  async create(payload: UpsertCredentialDto, currentUser: AuthenticatedUser) {
    try {
      const credential = await this.prismaService.credential.create({
        data: {
          ownerId: currentUser.id,
          name: payload.name.trim(),
          key: payload.key.trim(),
          type: payload.type,
          provider: payload.provider?.trim() || null,
          description: payload.description?.trim() || null,
          payload: payload.payload as Prisma.InputJsonValue,
        },
      });

      return this.serializeCredential(credential);
    } catch (error) {
      this.handleDuplicateKeyError(error, payload.key);
      throw error;
    }
  }

  async update(
    id: string,
    payload: UpsertCredentialDto,
    currentUser: AuthenticatedUser,
  ) {
    await this.getCredentialOrThrow(id, currentUser);

    try {
      const credential = await this.prismaService.credential.update({
        where: { id },
        data: {
          name: payload.name.trim(),
          key: payload.key.trim(),
          type: payload.type,
          provider: payload.provider?.trim() || null,
          description: payload.description?.trim() || null,
          payload: payload.payload as Prisma.InputJsonValue,
        },
      });

      return this.serializeCredential(credential);
    } catch (error) {
      this.handleDuplicateKeyError(error, payload.key);
      throw error;
    }
  }

  async remove(id: string, currentUser: AuthenticatedUser) {
    await this.getCredentialOrThrow(id, currentUser);
    await this.prismaService.credential.delete({
      where: { id },
    });

    return {
      id,
      deleted: true,
    };
  }

  private async getCredentialOrThrow(id: string, currentUser: AuthenticatedUser) {
    const credential = await this.prismaService.credential.findFirst({
      where: {
        id,
        ownerId: currentUser.id,
      },
    });

    if (!credential) {
      throw new NotFoundException(`Credential ${id} not found`);
    }

    return credential;
  }

  private serializeCredential(credential: {
    id: string;
    name: string;
    key: string;
    type: string;
    provider: string | null;
    description: string | null;
    payload: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const payload =
      credential.payload &&
      typeof credential.payload === 'object' &&
      !Array.isArray(credential.payload)
        ? (credential.payload as Record<string, unknown>)
        : {};

    const maskedPayload = Object.entries(payload).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        const text = value === null || value === undefined ? '' : String(value);
        acc[key] = text ? `${'*'.repeat(Math.max(4, text.length - 2))}${text.slice(-2)}` : '';
        return acc;
      },
      {},
    );

    return {
      ...credential,
      payload,
      maskedPayload,
    };
  }

  private handleDuplicateKeyError(error: unknown, key: string) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(`凭据标识 ${key} 已存在，请更换一个 key。`);
    }
  }
}
