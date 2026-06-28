import { IsString, IsEnum, IsNotEmpty, IsUrl } from 'class-validator';
import { DocumentType } from '../entities/driver-document.entity';

export class UploadDocumentDto {
  @IsNotEmpty()
  @IsEnum(DocumentType)
  type: DocumentType;

  @IsNotEmpty()
  @IsString()
  url: string; // URL link (Cloudinary image storage link)
}
