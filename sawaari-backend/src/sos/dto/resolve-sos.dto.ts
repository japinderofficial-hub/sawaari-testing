import { IsNotEmpty, IsString, Length } from 'class-validator';

export class ResolveSosDto {
  @IsNotEmpty()
  @IsString()
  @Length(5, 500)
  notes: string;
}
