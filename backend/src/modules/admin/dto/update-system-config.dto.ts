import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateSystemConfigDto {
  @IsOptional()
  @IsString()
  platformName?: string;

  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsOptional()
  @IsString()
  smtpUser?: string;

  @IsOptional()
  @IsString()
  smtpPass?: string;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  smtpFrom?: string;

  @IsOptional()
  @IsString()
  minioEndpoint?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  minioPort?: number;

  @IsOptional()
  @IsBoolean()
  minioUseSSL?: boolean;

  @IsOptional()
  @IsString()
  minioAccessKey?: string;

  @IsOptional()
  @IsString()
  minioSecretKey?: string;

  @IsOptional()
  @IsString()
  minioBucket?: string;

  @IsOptional()
  @IsNumber()
  @Min(100)
  screenshotIntervalMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(500)
  screenshotPersistIntervalMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  taskRetentionDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(100)
  monitorPageSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(32)
  globalTaskConcurrency?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(16)
  perUserTaskConcurrency?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  manualTaskPriority?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  scheduledTaskPriority?: number;
}
