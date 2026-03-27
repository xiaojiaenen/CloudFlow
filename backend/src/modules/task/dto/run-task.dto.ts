import { IsString } from 'class-validator';

export class RunTaskDto {
  @IsString()
  workflowId!: string;
}
