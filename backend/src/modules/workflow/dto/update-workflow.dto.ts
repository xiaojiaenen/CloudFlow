import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import {
  WorkflowAlertDto,
  WorkflowDefinitionDto,
  WorkflowScheduleDto,
} from './create-workflow.dto';

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowDefinitionDto)
  definition?: WorkflowDefinitionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowScheduleDto)
  schedule?: WorkflowScheduleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowAlertDto)
  alerts?: WorkflowAlertDto;
}
