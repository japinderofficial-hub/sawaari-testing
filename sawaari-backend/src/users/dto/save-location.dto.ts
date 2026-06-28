import { IsString, IsEnum, IsNumber, IsNotEmpty } from 'class-validator';
import { LocationType } from '../entities/saved-location.entity';

export class SaveLocationDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsEnum(LocationType)
  type: LocationType;

  @IsNotEmpty()
  @IsNumber()
  latitude: number;

  @IsNotEmpty()
  @IsNumber()
  longitude: number;

  @IsNotEmpty()
  @IsString()
  address: string;
}
