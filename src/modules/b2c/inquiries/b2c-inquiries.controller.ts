import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { InquiriesService } from '@/modules/inquiry/inquiries/inquiries.service';
import { QueryInquiryDto } from '@/modules/inquiry/inquiries/dto/query-inquiry.dto';
import { InquiryResponseDto } from '@/modules/inquiry/inquiries/dto/inquiry-response.dto';
import { CustomerJwtGuard } from '@/core/guards/customer-jwt.guard';
import { CurrentCustomer } from '@/core/decorators/current-customer.decorator';
import { ICustomer } from '@/core/interfaces/customer.interface';
import { ResponseUtil } from '@/shared/utils/response.util';
import { CreateCustomerInquiryDto } from './dto/create-customer-inquiry.dto';

/**
 * B2C 客户自助询价。身份仅来自 `@CurrentCustomer()`（CustomerJwtGuard 注入），
 * 请求体不含 customerId（forbidNonWhitelisted 拒绝任何身份字段）。
 * 不暴露状态流转端点（PATCH status 仅后台）。
 */
@ApiTags('B2C 客户询价')
@ApiBearerAuth('JWT-auth')
@Controller('b2c/inquiries')
@UseGuards(CustomerJwtGuard)
export class B2CInquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  @Post()
  @ApiOperation({ summary: '客户自助创建询价单（仅限当前客户）' })
  @ApiResponse({
    status: 201,
    description: '询价单创建成功',
    type: InquiryResponseDto,
  })
  async create(
    @CurrentCustomer() customer: ICustomer,
    @Body() dto: CreateCustomerInquiryDto,
  ) {
    const data = await this.inquiriesService.createForCustomer(
      customer.customerId,
      dto,
      dto.lines,
    );
    return ResponseUtil.created(data, '询价单创建成功');
  }

  @Get()
  @ApiOperation({ summary: '获取当前客户询价单列表' })
  @ApiResponse({ status: 200, description: '获取询价单列表成功' })
  async findAll(
    @CurrentCustomer() customer: ICustomer,
    @Query() query: QueryInquiryDto,
  ) {
    const pageData = await this.inquiriesService.findMyInquiries(
      customer.customerId,
      query,
    );
    return ResponseUtil.paginated(pageData, '获取询价单列表成功');
  }

  @Get(':id')
  @ApiOperation({ summary: '获取当前客户询价单详情（含报价状态）' })
  @ApiResponse({
    status: 200,
    description: '获取询价单详情成功',
    type: InquiryResponseDto,
  })
  async findOne(
    @CurrentCustomer() customer: ICustomer,
    @Param('id') id: string,
  ) {
    const data = await this.inquiriesService.findOneForCustomer(
      customer.customerId,
      id,
    );
    return ResponseUtil.found(data, '获取询价单详情成功');
  }
}