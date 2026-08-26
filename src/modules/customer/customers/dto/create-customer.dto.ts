import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ description: '用户名', example: 'john_doe' })
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @MaxLength(64)
  username: string;

  @ApiProperty({ description: '密码', example: 'P@ssw0rd' })
  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({ description: '邮箱', example: 'john@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  email?: string;

  @ApiPropertyOptional({ description: '手机号', example: '13800138000' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phoneNumber?: string;

  @ApiProperty({ description: '昵称', example: 'John' })
  @IsString()
  @IsNotEmpty({ message: '昵称不能为空' })
  @MaxLength(64)
  nickName: string;

  @ApiPropertyOptional({ description: '头像 URL' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({
    description: '状态：enabled-启用, disabled-禁用',
    example: 'enabled',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  status?: string;

  @ApiPropertyOptional({ description: '微信 openid' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  openid?: string;

  @ApiPropertyOptional({ description: '微信 unionid' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  unionid?: string;
}
