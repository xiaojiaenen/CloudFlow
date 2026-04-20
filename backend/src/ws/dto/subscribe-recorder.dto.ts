import { IsString } from 'class-validator';

export class SubscribeRecorderDto {
  @IsString()
  sessionId!: string;
}
