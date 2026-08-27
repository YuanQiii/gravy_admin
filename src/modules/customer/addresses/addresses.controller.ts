import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { QueryAddressDto } from './dto/query-address.dto';
import { AddressResponseDto } from './dto/address-response.dto';
import { BatchDeleteAddressesDto } from './dto/batch-delete-addresses.dto';
import { RequirePermissions } from '@/core/decorators/permissions.decorator';
import { OperationLog } from '@/core/decorators/operation-log.decorator';
import { ResponseUtil } from '@/shared/utils/response.util';
import { CUSTOMER_ADDRESS_PERMISSIONS } from '@/shared/constants/permissions.constant';
import { AccessGuard } from '@/core/guards/access.guard';

@ApiTags('客户地址管理')
@ApiBearerAuth('JWT-auth')
@Controller('customer/addresses')
@UseGuards(AccessGuard)
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Post()
  @RequirePermissions(CUSTOMER_ADDRESS_PERMISSIONS.CREATE)
  @OperationLog({ module: '客户地址管理' })
  @ApiOperation({ summary: '创建客户地址' })
  @ApiResponse({
    status: 201,
    description: '地址创建成功',
    type: AddressResponseDto,
  })
  async create(@Body() dto: CreateAddressDto) {
    const data = await this.addressesService.create(dto);
    return ResponseUtil.created(data, '地址创建成功');
  }

  @Get()
  @RequirePermissions(CUSTOMER_ADDRESS_PERMISSIONS.LIST)
  @ApiOperation({ summary: '获取客户地址列表' })
  @ApiResponse({ status: 200, description: '获取地址列表成功' })
  async findAll(@Query() query: QueryAddressDto) {
    const pageData = await this.addressesService.findAll(query);
    return ResponseUtil.paginated(pageData, '获取地址列表成功');
  }

  @Get(':id')
  @RequirePermissions(CUSTOMER_ADDRESS_PERMISSIONS.VIEW)
  @ApiOperation({ summary: '获取客户地址详情' })
  @ApiResponse({
    status: 200,
    description: '获取地址详情成功',
    type: AddressResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const data = await this.addressesService.findOne(id);
    return ResponseUtil.found(data, '获取地址详情成功');
  }

  @Patch(':id')
  @RequirePermissions(CUSTOMER_ADDRESS_PERMISSIONS.UPDATE)
  @OperationLog({ module: '客户地址管理', action: 'update' })
  @ApiOperation({ summary: '更新客户地址' })
  @ApiResponse({
    status: 200,
    description: '地址更新成功',
    type: AddressResponseDto,
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    const data = await this.addressesService.update(id, dto);
    return ResponseUtil.updated(data, '地址更新成功');
  }

  @Patch(':id/default')
  @RequirePermissions(CUSTOMER_ADDRESS_PERMISSIONS.UPDATE)
  @OperationLog({ module: '客户地址管理', action: 'update' })
  @ApiOperation({ summary: '设置默认地址' })
  @ApiResponse({ status: 200, description: '默认地址设置成功' })
  async setDefault(@Param('id') id: string) {
    await this.addressesService.setDefault(id);
    return ResponseUtil.updated(null, '默认地址设置成功');
  }

  @Delete(':id')
  @RequirePermissions(CUSTOMER_ADDRESS_PERMISSIONS.DELETE)
  @OperationLog({ module: '客户地址管理', action: 'delete' })
  @ApiOperation({ summary: '删除客户地址（软删除）' })
  @ApiResponse({ status: 200, description: '地址删除成功' })
  async remove(@Param('id') id: string) {
    await this.addressesService.remove(id);
    return ResponseUtil.deleted(null, '地址删除成功');
  }

  @Post('batch-delete')
  @RequirePermissions(CUSTOMER_ADDRESS_PERMISSIONS.DELETE)
  @OperationLog({ module: '客户地址管理', action: 'delete' })
  @ApiOperation({ summary: '批量删除客户地址' })
  @ApiBody({ type: BatchDeleteAddressesDto })
  @ApiResponse({ status: 200, description: '批量删除成功' })
  async batchDelete(@Body() dto: BatchDeleteAddressesDto) {
    await this.addressesService.removeMany(dto.ids);
    return ResponseUtil.deleted(null, '地址批量删除成功');
  }
}
