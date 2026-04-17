import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
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
  @IsString()
  installedFromTemplateId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['draft', 'active', 'archived'])
  status?: 'draft' | 'active' | 'archived';

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
