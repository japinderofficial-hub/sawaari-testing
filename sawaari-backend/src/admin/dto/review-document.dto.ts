import { IsEnum, IsString, IsOptional, Length } from 'class-validator';
import { DocumentStatus } from '../../drivers/entities/driver-document.entity';

export class ReviewDocumentDto {
  @IsEnum(DocumentStatus)
  status: DocumentStatus;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  comments?: string;
}
