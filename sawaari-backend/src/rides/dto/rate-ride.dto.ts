import { IsInt, Min, Max, IsString, IsOptional } from 'class-validator';

export class RateRideDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  review?: string;
}
