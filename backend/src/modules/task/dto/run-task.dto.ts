import { IsObject, IsOptional, IsString } from 'class-validator';

export class RunTaskDto {
  @IsString()
  workflowId!: string;

  @IsOptional()
  @IsObject()
  inputs?: Record<string, unknown>;
}
