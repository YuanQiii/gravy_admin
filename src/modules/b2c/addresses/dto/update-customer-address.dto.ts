import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';
import { CreateCustomerAddressDto } from './create-customer-address.dto';

/**
 * B2C 客户自助更新收货地址 DTO（全部可选，无 customerId，归属取登录态）。
 */
export class UpdateCustomerAddressDto extends PartialType(
  CreateCustomerAddressDto,
) {}