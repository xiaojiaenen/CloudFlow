import { IsString } from 'class-validator';

export class RecorderPressKeyDto {
  @IsString()
  key!: string;
}
