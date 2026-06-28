import { IsString, IsNotEmpty, Length, IsOptional } from 'class-validator';

export class RegisterDriverDto {
  @IsNotEmpty()
  @IsString()
  @Length(4, 20)
  vehicleNo: string;

  @IsNotEmpty()
  @IsString()
  @Length(2, 50)
  vehicleModel: string;

  @IsOptional()
  @IsString()
  @Length(12, 12, { message: 'Aadhaar number must be exactly 12 digits' })
  aadhaarNo?: string;
}
