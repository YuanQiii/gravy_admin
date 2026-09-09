import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CatalogsService } from '@/modules/equipment/catalogs/catalogs.service';
import { QueryCatalogDto } from '@/modules/equipment/catalogs/dto/query-catalog.dto';
import { CatalogResponseDto } from '@/modules/equipment/catalogs/dto/catalog-response.dto';
import { Public, ResponseUtil } from '@gvray/core';


import { B2C_OPTS } from '../b2c.constants';

@ApiTags('B2C 设备目录浏览')
@Controller('b2c/catalogs')
export class B2CCatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  @Get()
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'B2C 浏览设备目录列表',
    description: '公开接口，无需认证；强制 status=enabled + 加权排序',
  })
  @ApiResponse({ status: 200, description: '获取设备目录列表成功' })
  async findAll(@Query() query: QueryCatalogDto) {
    const pageData = await this.catalogsService.findAll(query, B2C_OPTS);
    return ResponseUtil.paginated(pageData, '获取设备目录列表成功');
  }

  @Get(':id')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'B2C 浏览设备目录详情',
    description: '公开接口，无需认证；强制 status=enabled',
  })
  @ApiResponse({
    status: 200,
    description: '获取设备目录详情成功',
    type: CatalogResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const data = await this.catalogsService.findOne(id, B2C_OPTS);
    return ResponseUtil.found(data, '获取设备目录详情成功');
  }
}