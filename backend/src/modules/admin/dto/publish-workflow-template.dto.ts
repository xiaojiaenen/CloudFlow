import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class PublishWorkflowTemplateDto {
  @IsString()
  workflowId!: string;

  @IsString()
  slug!: string;

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsString()
  category!: string;

  @IsArray()
  tags!: string[];

  @IsOptional()
  @IsString()
  authorName?: string;

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;
}
