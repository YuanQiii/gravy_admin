import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsIn,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  registerDecorator,
} from 'class-validator';
import { INQUIRY_STATUS_VALUES, INQUIRY_STATUS } from '@gvray/core';

/**
 * 跨字段条件校验：`status === 'quoted'` 时 `expiresAt` 必填。
 *
 * 「报价必须携带有效期」是业务不变量（quoted 且无期限 = 永久报价，客户会拿到
 * 一张永不失效的报价单），在 DTO 层一次拒绝（400），不进 service。
 *
 * ⚠️ 约束必须挂在 **`status`**（必填字段）上而不是 `expiresAt` 上：后者是
 * `@IsOptional()`，值为 undefined 时该属性上的**全部**校验器（含自定义）都会
 * 被跳过 —— 挂错位置的直接后果是"quoted 不带 expiresAt"恰好是最需要拦的场景
 * 却永远拦不住。与全局 `forbidNonWhitelisted` 不冲突：只读取已声明字段。
 */
@ValidatorConstraint({ name: 'quotedRequiresExpiresAt', async: false })
export class QuotedRequiresExpiresAtConstraint
  implements ValidatorConstraintInterface
{
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as UpdateInquiryStatusDto;
    if (dto.status !== INQUIRY_STATUS.QUOTED) return true;
    return typeof dto.expiresAt === 'string' && dto.expiresAt.length > 0;
  }

  defaultMessage(): string {
    return 'QUOTED_REQUIRES_EXPIRES_AT';
  }
}

function QuotedRequiresExpiresAt() {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      constraints: [],
      validator: QuotedRequiresExpiresAtConstraint,
    });
  };
}

export class UpdateInquiryStatusDto {
  @ApiProperty({
    description: '询价单状态（draft/submitted/quoted/expired）',
    enum: INQUIRY_STATUS_VALUES,
    example: 'submitted',
  })
  @IsString()
  @IsIn(INQUIRY_STATUS_VALUES)
  @QuotedRequiresExpiresAt()
  status: string;

  @ApiPropertyOptional({
    description:
      '过期时间（ISO 8601 日期字符串）。**status=quoted 时必填** —— 报价必须携带有效期，缺失将被 400 拒绝（错误码 QUOTED_REQUIRES_EXPIRES_AT）',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}
