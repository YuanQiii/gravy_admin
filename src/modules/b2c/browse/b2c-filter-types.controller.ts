import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FilterTypesService } from '@/modules/equipment/filter-types/filter-types.service';
import { QueryFilterTypeDto } from '@/modules/equipment/filter-types/dto/query-filter-type.dto';
import { FilterTypeResponseDto } from '@/modules/equipment/filter-types/dto/filter-type-response.dto';
import { Public, ResponseUtil } from '@gvray/core';


import { B2C_OPTS } from '../b2c.constants';

@ApiTags('B2C 滤清器类型浏览')
@Controller('b2c/filter-types')
export class B2CFilterTypesController {
  constructor(private readonly filterTypesService: FilterTypesService) {}

  @Get()
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'B2C 浏览滤清器类型列表',
    description: '公开接口，无需认证；强制 status=enabled',
  })
  @ApiResponse({ status: 200, description: '获取滤清器类型列表成功' })
  async findAll(@Query() query: QueryFilterTypeDto) {
    const pageData = await this.filterTypesService.findAll(query, B2C_OPTS);
    return ResponseUtil.paginated(pageData, '获取滤清器类型列表成功');
  }

  @Get('options')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'B2C 浏览启用的滤清器类型下拉选项',
    description: '公开接口，无需认证',
  })
  @ApiResponse({ status: 200, description: '获取下拉选项成功' })
  async findOptions() {
    const data = await this.filterTypesService.findAllEnabled();
    return ResponseUtil.found(data, '获取下拉选项成功');
  }

  @Get(':id')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'B2C 浏览滤清器类型详情',
    description: '公开接口，无需认证；强制 status=enabled',
  })
  @ApiResponse({
    status: 200,
    description: '获取滤清器类型详情成功',
    type: FilterTypeResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const data = await this.filterTypesService.findOne(id, B2C_OPTS);
    return ResponseUtil.found(data, '获取滤清器类型详情成功');
  }
}