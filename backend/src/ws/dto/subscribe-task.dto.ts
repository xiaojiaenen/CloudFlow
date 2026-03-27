import { IsString } from 'class-validator';

export class SubscribeTaskDto {
  @IsString()
  taskId!: string;
}
