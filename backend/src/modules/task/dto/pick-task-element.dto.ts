import { IsNumber, Max, Min } from 'class-validator';

export class PickTaskElementDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  xRatio!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  yRatio!: number;
}
