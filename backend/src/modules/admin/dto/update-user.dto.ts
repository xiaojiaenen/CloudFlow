import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['admin', 'user'])
  role?: 'admin' | 'user';

  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: 'active' | 'suspended';
}
