import {
  IsArray,
  IsBoolean,
  IsEmail,
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
}

export class CreateWorkflowDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

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
