import { IsIn } from 'class-validator';

export class RecorderMoveActionDto {
  @IsIn(['up', 'down'])
  direction!: 'up' | 'down';
}
