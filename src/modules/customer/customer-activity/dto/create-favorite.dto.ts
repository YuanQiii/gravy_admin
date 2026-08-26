import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateFavoriteDto {
  @ApiProperty({ description: '客户ID（customerId UUID）' })
  @IsString()
  @IsNotEmpty({ message: '客户ID不能为空' })
  customerId: string;

  @ApiProperty({ description: '滤清器ID（filterId UUID）' })
  @IsString()
  @IsNotEmpty({ message: '滤清器ID不能为空' })
  filterId: string;
}
