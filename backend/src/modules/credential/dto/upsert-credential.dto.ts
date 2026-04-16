import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpsertCredentialDto {
  @IsString()
  name!: string;

  @IsString()
  key!: string;

  @IsString()
  @IsIn(['account', 'api_key', 'cookie', 'smtp', 'custom'])
  type!: 'account' | 'api_key' | 'cookie' | 'smtp' | 'custom';

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsObject()
  payload!: Record<string, unknown>;
}
