import { IsOptional, IsString } from 'class-validator';

export class FinishRecorderSessionDto {
  @IsOptional()
  @IsString()
  name?: string;
}
