import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateRecorderActionDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  selector?: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsIn(['up', 'down', 'top', 'bottom'])
  direction?: 'up' | 'down' | 'top' | 'bottom';

  @IsOptional()
  @IsNumber()
  @Min(1)
  distance?: number;

  @IsOptional()
  @IsBoolean()
  useRuntimeInput?: boolean;

  @IsOptional()
  @IsString()
  parameterKey?: string;

  @IsOptional()
  @IsString()
  parameterLabel?: string;

  @IsOptional()
  @IsString()
  parameterDescription?: string;
}
