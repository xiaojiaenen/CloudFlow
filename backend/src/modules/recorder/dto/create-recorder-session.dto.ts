import { IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateRecorderSessionDto {
  @IsOptional()
  @IsUrl({
    require_tld: false,
    require_protocol: true,
  })
  url?: string;

  @IsOptional()
  @IsString()
  name?: string;
}
