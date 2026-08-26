import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Transform } from 'class-transformer';

/**
 * 微信标识脱敏：保留前 4 + 后 4，中间用 ... 占位。
 * 长度 <= 8 时统一返回 '****'。空值返回 null。
 */
function maskWechatId(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  if (value.length <= 8) {
    return '****';
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export class CustomerResponseDto {
  @ApiProperty({ type: 'integer' })
  @Exclude()
  id: number;

  @ApiProperty({ description: '密码（永不返回）' })
  @Exclude()
  password: string;

  @ApiProperty({
    description: '客户唯一标识（UUID）',
    example: 'c1d7d76e-5a4e-4f0a-93c3-d0b2b27d471e',
  })
  @Expose()
  customerId: string;

  @ApiProperty({ description: '用户名' })
  @Expose()
  username: string;

  @ApiPropertyOptional({ description: '邮箱' })
  @Expose()
  email?: string;

  @ApiPropertyOptional({ description: '手机号' })
  @Expose()
  phoneNumber?: string;

  @ApiProperty({ description: '昵称' })
  @Expose()
  nickName: string;

  @ApiPropertyOptional({ description: '头像 URL' })
  @Expose()
  avatar?: string;

  @ApiProperty({ description: '状态' })
  @Expose()
  status: string;

  @ApiPropertyOptional({
    description: '微信 openid（脱敏：前4后4）',
    example: 'abcd...wxyz',
  })
  @Expose()
  @Transform(({ value }) => maskWechatId(value))
  openid?: string;

  @ApiPropertyOptional({
    description: '微信 unionid（脱敏：前4后4）',
    example: 'abcd...wxyz',
  })
  @Expose()
  @Transform(({ value }) => maskWechatId(value))
  unionid?: string;

  @ApiProperty({ description: '创建时间', type: 'string', format: 'date-time' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: '更新时间', type: 'string', format: 'date-time' })
  @Expose()
  updatedAt: Date;
}
