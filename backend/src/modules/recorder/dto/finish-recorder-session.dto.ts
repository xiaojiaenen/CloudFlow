import { IsIn, IsOptional, IsString } from 'class-validator';

export class FinishRecorderSessionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['workflow', 'template'])
  mode?: 'workflow' | 'template';
}
