import { IsString, IsUrl } from 'class-validator';

export class RecorderNavigateDto {
  @IsUrl({
    require_tld: false,
    require_protocol: true,
  })
  url!: string;
}
