import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateRideDto {
  @IsNotEmpty()
  @IsNumber()
  pickupLatitude: number;

  @IsNotEmpty()
  @IsNumber()
  pickupLongitude: number;

  @IsNotEmpty()
  @IsString()
  pickupAddress: string;

  @IsNotEmpty()
  @IsNumber()
  dropoffLatitude: number;

  @IsNotEmpty()
  @IsNumber()
  dropoffLongitude: number;

  @IsNotEmpty()
  @IsString()
  dropoffAddress: string;
}
