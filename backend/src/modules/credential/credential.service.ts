import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  decryptJsonValue,
  encryptJsonValue,
  maskSecretValue,
} from 'src/common/utils/secret-envelope';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { UpsertCredentialDto } from './dto/upsert-credential.dto';

@Injectable()
export class CredentialService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

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
          payload: {},
          payloadCiphertext: this.encryptPayload(payload.payload),
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
          payload: {},
          payloadCiphertext: this.encryptPayload(payload.payload),
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
    payloadCiphertext?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const payload = this.readPayload(credential.payload, credential.payloadCiphertext);

    const maskedPayload = Object.entries(payload).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        const text = value === null || value === undefined ? '' : String(value);
        acc[key] = text ? maskSecretValue(text) : '';
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

  private readPayload(payload: Prisma.JsonValue, payloadCiphertext?: string | null) {
    if (payloadCiphertext?.trim()) {
      return decryptJsonValue(payloadCiphertext, this.getSecretEnvelopeKey());
    }

    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  }

  private encryptPayload(payload: Record<string, unknown>) {
    return encryptJsonValue(payload, this.getSecretEnvelopeKey());
  }

  private getSecretEnvelopeKey() {
    return this.configService.get<string>(
      'SECRET_ENCRYPTION_KEY',
      'cloudflow-dev-secret-key',
    );
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
