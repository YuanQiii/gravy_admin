import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FiltersService, QueryFilterDto, FilterResponseDto } from '@gvray/domain';
import { Public, ResponseUtil } from '@gvray/core';


import { B2C_OPTS } from '../b2c.constants';

@ApiTags('B2C 滤清器浏览')
@Controller('b2c/filters')
export class B2CFiltersController {
  constructor(private readonly filtersService: FiltersService) {}

  @Get()
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'B2C 浏览滤清器列表',
    description: '公开接口，无需认证；强制 status=enabled + 加权排序',
  })
  @ApiResponse({ status: 200, description: '获取滤清器列表成功' })
  async findAll(@Query() query: QueryFilterDto) {
    const pageData = await this.filtersService.findAll(query, B2C_OPTS);
    return ResponseUtil.paginated(pageData, '获取滤清器列表成功');
  }

  @Get(':id')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'B2C 浏览滤清器详情',
    description: '公开接口，无需认证；强制 status=enabled',
  })
  @ApiResponse({
    status: 200,
    description: '获取滤清器详情成功',
    type: FilterResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const data = await this.filtersService.findOne(id, B2C_OPTS);
    return ResponseUtil.found(data, '获取滤清器详情成功');
  }
}