import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FiltersService, QueryFilterDto, FilterResponseDto } from '@gvray/domain';
import { Public, ResponseUtil, REQUEST_ID_PROP } from '@gvray/core';

import { MALL_OPTS } from '../mall.constants';
import { OptionalCustomerGuard } from '@/core/guards/optional-customer.guard';
import { CurrentCustomer } from '@/core/decorators/current-customer.decorator';
import { ICustomer } from '@/core/interfaces/customer.interface';
import { FilterDetailFlow } from './filter-detail.flow';

@ApiTags('商城滤清器浏览')
@Controller('filters')
export class MallFiltersController {
  constructor(
    private readonly filtersService: FiltersService,
    private readonly filterDetailFlow: FilterDetailFlow,
  ) {}

  @Get()
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: '商城浏览滤清器列表',
    description: '公开接口，无需认证；强制 status=enabled + 加权排序',
  })
  @ApiResponse({ status: 200, description: '获取滤清器列表成功' })
  async findAll(@Query() query: QueryFilterDto) {
    const pageData = await this.filtersService.findAll(query, MALL_OPTS);
    return ResponseUtil.paginated(pageData, '获取滤清器列表成功');
  }

  @Get(':id')
  @Public()
  @UseGuards(OptionalCustomerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: '商城浏览滤清器详情',
    description:
      '公开接口，无需认证；强制 status=enabled。已登录客户访问会记录浏览历史，匿名不记录。',
  })
  @ApiResponse({
    status: 200,
    description: '获取滤清器详情成功',
    type: FilterResponseDto,
  })
  async findOne(
    @CurrentCustomer() customer: ICustomer | undefined,
    @Req() request: Request & Record<string, unknown>,
    @Param('id') id: string,
  ) {
    // 透传请求关联 ID，使写历史的失败日志可与本次响应关联（x-request-id）
    const data = await this.filterDetailFlow.viewFilterDetail(
      customer?.customerId,
      id,
      typeof request[REQUEST_ID_PROP] === 'string'
        ? (request[REQUEST_ID_PROP] as string)
        : null,
    );
    return ResponseUtil.found(data, '获取滤清器详情成功');
  }
}