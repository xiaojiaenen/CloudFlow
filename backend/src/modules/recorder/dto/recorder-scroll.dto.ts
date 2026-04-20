import { IsIn, IsNumber, IsOptional, Min } from 'class-validator';

export class RecorderScrollDto {
  @IsIn(['up', 'down', 'top', 'bottom'])
  direction!: 'up' | 'down' | 'top' | 'bottom';

  @IsOptional()
  @IsNumber()
  @Min(1)
  distance?: number;
}
