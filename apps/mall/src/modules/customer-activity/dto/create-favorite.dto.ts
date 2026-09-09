import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateFavoriteDto {
  @ApiProperty({ description: '滤清器ID（filterId UUID）' })
  @IsString()
  @IsNotEmpty({ message: '滤清器ID不能为空' })
  filterId: string;
}
