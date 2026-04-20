import { IsNumber, IsString, Max, Min } from 'class-validator';

export class RecorderInputDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  xRatio!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  yRatio!: number;

  @IsString()
  value!: string;
}
