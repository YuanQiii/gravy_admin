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
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { BatchDeleteCustomersDto } from './dto/batch-delete-customers.dto';
import { RequirePermissions } from '@/core/decorators/permissions.decorator';
import { OperationLog } from '@/core/decorators/operation-log.decorator';
import { ResponseUtil } from '@/shared/utils/response.util';
import { CUSTOMER_PERMISSIONS } from '@/shared/constants/permissions.constant';
import { AccessGuard } from '@/core/guards/access.guard';

@ApiTags('客户管理')
@ApiBearerAuth('JWT-auth')
@Controller('customer/customers')
@UseGuards(AccessGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @RequirePermissions(CUSTOMER_PERMISSIONS.CREATE)
  @OperationLog({ module: '客户管理' })
  @ApiOperation({ summary: '创建客户' })
  @ApiResponse({
    status: 201,
    description: '客户创建成功',
    type: CustomerResponseDto,
  })
  async create(@Body() dto: CreateCustomerDto) {
    // Customer is B2C self-service — no audit fields (createdById/updatedById).
    const data = await this.customersService.create(dto);
    return ResponseUtil.created(data, '客户创建成功');
  }

  @Get()
  @RequirePermissions(CUSTOMER_PERMISSIONS.LIST)
  @ApiOperation({ summary: '获取客户列表' })
  @ApiResponse({ status: 200, description: '获取客户列表成功' })
  async findAll(@Query() query: QueryCustomerDto) {
    const pageData = await this.customersService.findAll(query);
    return ResponseUtil.paginated(pageData, '获取客户列表成功');
  }

  @Get(':id')
  @RequirePermissions(CUSTOMER_PERMISSIONS.VIEW)
  @ApiOperation({ summary: '获取客户详情' })
  @ApiResponse({
    status: 200,
    description: '获取客户详情成功',
    type: CustomerResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const data = await this.customersService.findOne(id);
    return ResponseUtil.found(data, '获取客户详情成功');
  }

  @Patch(':id')
  @RequirePermissions(CUSTOMER_PERMISSIONS.UPDATE)
  @OperationLog({ module: '客户管理', action: 'update' })
  @ApiOperation({ summary: '更新客户' })
  @ApiResponse({
    status: 200,
    description: '客户更新成功',
    type: CustomerResponseDto,
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    const data = await this.customersService.update(id, dto);
    return ResponseUtil.updated(data, '客户更新成功');
  }

  @Delete(':id')
  @RequirePermissions(CUSTOMER_PERMISSIONS.DELETE)
  @OperationLog({ module: '客户管理', action: 'delete' })
  @ApiOperation({ summary: '删除客户（软删除）' })
  @ApiResponse({ status: 200, description: '客户删除成功' })
  async remove(@Param('id') id: string) {
    await this.customersService.remove(id);
    return ResponseUtil.deleted(null, '客户删除成功');
  }

  @Post('batch-delete')
  @RequirePermissions(CUSTOMER_PERMISSIONS.DELETE)
  @OperationLog({ module: '客户管理', action: 'delete' })
  @ApiOperation({ summary: '批量删除客户' })
  @ApiBody({ type: BatchDeleteCustomersDto })
  @ApiResponse({ status: 200, description: '批量删除成功' })
  async batchDelete(@Body() dto: BatchDeleteCustomersDto) {
    await this.customersService.removeMany(dto.ids);
    return ResponseUtil.deleted(null, '客户批量删除成功');
  }
}
