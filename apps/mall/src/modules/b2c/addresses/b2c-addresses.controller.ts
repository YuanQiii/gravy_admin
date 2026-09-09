import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CustomerJwtGuard } from '@/core/guards/customer-jwt.guard';
import { CurrentCustomer } from '@/core/decorators/current-customer.decorator';
import { ICustomer } from '@/core/interfaces/customer.interface';
import { ResponseUtil } from '@gvray/core';

import { CustomerAddressesService } from './customer-addresses.service';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { UpdateCustomerAddressDto } from './dto/update-customer-address.dto';
import { AddressResponseDto } from './dto/address-response.dto';
import { QueryAddressDto } from './dto/query-address.dto';

/**
 * B2C 客户自助收货地址。身份仅来自 `@CurrentCustomer()`（CustomerJwtGuard 注入），
 * 请求体不含 customerId（forbidNonWhitelisted 拒绝）。归属校验在
 * CustomerAddressesService 内（他人 addressId → 404）。
 */
@ApiTags('B2C 客户收货地址')
@ApiBearerAuth('JWT-auth')
@Controller('b2c/addresses')
@UseGuards(CustomerJwtGuard)
export class B2CAddressesController {
  constructor(private readonly addressesService: CustomerAddressesService) {}

  @Get()
  @ApiOperation({ summary: '获取当前客户收货地址列表' })
  @ApiResponse({ status: 200, description: '获取地址列表成功' })
  async findAll(
    @CurrentCustomer() customer: ICustomer,
    @Query() query: QueryAddressDto,
  ) {
    const pageData = await this.addressesService.findMyAddresses(
      customer.customerId,
      query,
    );
    return ResponseUtil.paginated(pageData, '获取地址列表成功');
  }

  @Post()
  @ApiOperation({ summary: '新增收货地址（仅限当前客户）' })
  @ApiResponse({
    status: 201,
    description: '地址创建成功',
    type: AddressResponseDto,
  })
  async create(
    @CurrentCustomer() customer: ICustomer,
    @Body() dto: CreateCustomerAddressDto,
  ) {
    const data = await this.addressesService.createForCustomer(
      customer.customerId,
      dto,
    );
    return ResponseUtil.created(data, '地址创建成功');
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新本人收货地址' })
  @ApiResponse({
    status: 200,
    description: '地址更新成功',
    type: AddressResponseDto,
  })
  async update(
    @CurrentCustomer() customer: ICustomer,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerAddressDto,
  ) {
    const data = await this.addressesService.updateForCustomer(
      customer.customerId,
      id,
      dto,
    );
    return ResponseUtil.updated(data, '地址更新成功');
  }

  @Patch(':id/default')
  @ApiOperation({ summary: '将本人收货地址设为默认' })
  @ApiResponse({ status: 200, description: '设为默认成功' })
  async setDefault(
    @CurrentCustomer() customer: ICustomer,
    @Param('id') id: string,
  ) {
    await this.addressesService.setDefaultForCustomer(
      customer.customerId,
      id,
    );
    return ResponseUtil.updated(null, '设为默认成功');
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除本人收货地址' })
  @ApiResponse({ status: 200, description: '地址删除成功' })
  async remove(
    @CurrentCustomer() customer: ICustomer,
    @Param('id') id: string,
  ) {
    await this.addressesService.removeForCustomer(customer.customerId, id);
    return ResponseUtil.deleted(null, '地址删除成功');
  }
}