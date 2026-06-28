import { IsNotEmpty, IsNumber, IsUUID } from 'class-validator';

export class CreateSosDto {
  @IsNotEmpty()
  @IsUUID()
  rideId: string;

  @IsNotEmpty()
  @IsNumber()
  latitude: number;

  @IsNotEmpty()
  @IsNumber()
  longitude: number;
}
