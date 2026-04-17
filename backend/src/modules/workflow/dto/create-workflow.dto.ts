import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class WorkflowNodeDto {
  @IsString()
  type!: string;

  [key: string]: unknown;
}

class WorkflowCanvasNodePositionDto {
  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;
}

class WorkflowCanvasNodeDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @ValidateNested()
  @Type(() => WorkflowCanvasNodePositionDto)
  position!: WorkflowCanvasNodePositionDto;

  @IsObject()
  data!: Record<string, unknown>;
}

class WorkflowCanvasEdgeDto {
  @IsString()
  id!: string;

  @IsString()
  source!: string;

  @IsString()
  target!: string;

  @IsOptional()
  @IsString()
  sourceHandle?: string;

  @IsOptional()
  @IsString()
  targetHandle?: string;
}

class WorkflowCanvasDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowCanvasNodeDto)
  nodes!: WorkflowCanvasNodeDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowCanvasEdgeDto)
  edges!: WorkflowCanvasEdgeDto[];
}

class WorkflowInputFieldOptionDto {
  @IsString()
  label!: string;

  @IsString()
  value!: string;
}

class WorkflowInputFieldDto {
  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsString()
  @IsIn(['text', 'textarea', 'password', 'number', 'select', 'date', 'email'])
  type!: 'text' | 'textarea' | 'password' | 'number' | 'select' | 'date' | 'email';

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  sensitive?: boolean;

  @IsOptional()
  @IsString()
  placeholder?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  defaultValue?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowInputFieldOptionDto)
  options?: WorkflowInputFieldOptionDto[];
}

class WorkflowCredentialRequirementDto {
  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsString()
  @IsIn(['account', 'api_key', 'cookie', 'smtp', 'custom'])
  type!: 'account' | 'api_key' | 'cookie' | 'smtp' | 'custom';

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class WorkflowScheduleDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  cron?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class WorkflowAlertDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsBoolean()
  onFailure!: boolean;

  @IsBoolean()
  onSuccess!: boolean;
}

export class WorkflowDefinitionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowNodeDto)
  nodes!: WorkflowNodeDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowCanvasDto)
  canvas?: WorkflowCanvasDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowInputFieldDto)
  inputSchema?: WorkflowInputFieldDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowCredentialRequirementDto)
  credentialRequirements?: WorkflowCredentialRequirementDto[];
}

export class CreateWorkflowDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  installedFromTemplateId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['draft', 'active', 'archived'])
  status?: 'draft' | 'active' | 'archived';

  @ValidateNested()
  @Type(() => WorkflowDefinitionDto)
  definition!: WorkflowDefinitionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowScheduleDto)
  schedule?: WorkflowScheduleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowAlertDto)
  alerts?: WorkflowAlertDto;
}
