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
import { InquiriesService, QueryInquiryDto, InquiryResponseDto, InquiryDetailResponseDto, CreateCustomerInquiryDto } from '@gvray/domain';
import { CustomerJwtGuard } from '@/core/guards/customer-jwt.guard';
import { CurrentCustomer } from '@/core/decorators/current-customer.decorator';
import { ICustomer } from '@/core/interfaces/customer.interface';
import { ResponseUtil } from '@gvray/core';

/**
 * 商城客户自助询价。身份仅来自 `@CurrentCustomer()`（CustomerJwtGuard 注入），
 * 请求体不含 customerId（forbidNonWhitelisted 拒绝任何身份字段）。
 * 不暴露状态流转端点（PATCH status 仅后台）。
 */
@ApiTags('商城客户询价')
@ApiBearerAuth('JWT-auth')
@Controller('inquiries')
@UseGuards(CustomerJwtGuard)
export class MallInquiriesController {
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

  @Post(':id/submit')
  @ApiOperation({ summary: '提交当前客户的 draft 询价单（draft→submitted）' })
  @ApiResponse({
    status: 200,
    description: '询价单提交成功',
    type: InquiryResponseDto,
  })
  @ApiResponse({
    status: 409,
    description:
      '流转不合法或前置状态已失效（INQUIRY_INVALID_STATUS_TRANSITION）——状态已被并发流转改变时不写入任何字段',
  })
  async submit(
    @CurrentCustomer() customer: ICustomer,
    @Param('id') id: string,
  ) {
    const data = await this.inquiriesService.submitForCustomer(
      customer.customerId,
      id,
    );
    return ResponseUtil.updated(data, '询价单提交成功');
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: '取消当前客户的 draft/submitted 询价单（→cancelled，终态）',
  })
  @ApiResponse({
    status: 200,
    description: '询价单取消成功',
    type: InquiryResponseDto,
  })
  @ApiResponse({
    status: 409,
    description:
      '流转不合法或前置状态已失效（INQUIRY_INVALID_STATUS_TRANSITION）——状态已被并发流转改变时不写入任何字段',
  })
  async cancel(
    @CurrentCustomer() customer: ICustomer,
    @Param('id') id: string,
  ) {
    const data = await this.inquiriesService.cancelForCustomer(
      customer.customerId,
      id,
    );
    return ResponseUtil.updated(data, '询价单取消成功');
  }

  @Get(':id')
  @ApiOperation({
    summary: '获取当前客户询价单详情（含明细行与报价状态）',
    description:
      '响应携带该询价单的全部未软删除明细行，按 sortOrder 升序（同值按 createdAt 升序）；明细金额 unitPrice/subtotal 以数值传输，未报价为 null',
  })
  @ApiResponse({
    status: 200,
    description: '获取询价单详情成功',
    type: InquiryDetailResponseDto,
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