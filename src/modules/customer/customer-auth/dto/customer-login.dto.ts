import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

/**
 * 客户登录 DTO。
 *
 * 单一 `identifier` 字段：Service 按 `username → email → phoneNumber` 顺序
 * 解析（三者均为唯一索引），任一失败统一 401、话术一致，不泄露哪个凭证/字段错。
 */
export class CustomerLoginDto {
  @ApiProperty({
    description: '登录凭证：支持用户名、邮箱或手机号',
    example: 'customer.one',
  })
  @IsString({ message: 'identifier 必须是字符串' })
  @IsNotEmpty({ message: 'identifier 不能为空' })
  identifier: string;

  @ApiProperty({ description: '密码', example: '123456' })
  @IsString({ message: '密码必须是字符串' })
  @MinLength(6, { message: '密码至少需要 6 个字符' })
  password: string;
}