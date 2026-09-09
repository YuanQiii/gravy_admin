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
import { CatalogsService } from './catalogs.service';
import { CreateCatalogDto } from './dto/create-catalog.dto';
import { UpdateCatalogDto } from './dto/update-catalog.dto';
import { QueryCatalogDto } from './dto/query-catalog.dto';
import { CatalogResponseDto } from './dto/catalog-response.dto';
import { BatchDeleteCatalogsDto } from './dto/batch-delete-catalogs.dto';
import { RequirePermissions, OperationLog, CurrentUser, ResponseUtil, EQUIPMENT_CATALOG_PERMISSIONS, AccessGuard } from '@gvray/core';







@ApiTags('设备目录管理')
@ApiBearerAuth('JWT-auth')
@Controller('equipment/catalogs')
@UseGuards(AccessGuard)
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  @Post()
  @RequirePermissions(EQUIPMENT_CATALOG_PERMISSIONS.CREATE)
  @OperationLog({ module: '设备目录管理' })
  @ApiOperation({ summary: '创建设备目录' })
  @ApiResponse({
    status: 201,
    description: '目录创建成功',
    type: CatalogResponseDto,
  })
  async create(
    @Body() dto: CreateCatalogDto,
    @CurrentUser() user: { userId?: string },
  ) {
    const data = await this.catalogsService.create(dto, user?.userId);
    return ResponseUtil.created(data, '目录创建成功');
  }

  @Get()
  @RequirePermissions(EQUIPMENT_CATALOG_PERMISSIONS.VIEW)
  @OperationLog({ module: '设备目录管理', action: 'view' })
  @ApiOperation({ summary: '获取设备目录列表' })
  @ApiResponse({ status: 200, description: '获取设备目录列表成功' })
  async findAll(@Query() query: QueryCatalogDto) {
    const pageData = await this.catalogsService.findAll(query);
    return ResponseUtil.paginated(pageData, '获取设备目录列表成功');
  }

  @Get(':id')
  @RequirePermissions(EQUIPMENT_CATALOG_PERMISSIONS.VIEW)
  @OperationLog({ module: '设备目录管理', action: 'view' })
  @ApiOperation({ summary: '获取设备目录详情' })
  @ApiResponse({
    status: 200,
    description: '获取设备目录详情成功',
    type: CatalogResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const data = await this.catalogsService.findOne(id);
    return ResponseUtil.found(data, '获取设备目录详情成功');
  }

  @Patch(':id')
  @RequirePermissions(EQUIPMENT_CATALOG_PERMISSIONS.UPDATE)
  @OperationLog({ module: '设备目录管理', action: 'update' })
  @ApiOperation({ summary: '更新设备目录' })
  @ApiResponse({
    status: 200,
    description: '目录更新成功',
    type: CatalogResponseDto,
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCatalogDto,
    @CurrentUser() user: { userId?: string },
  ) {
    const data = await this.catalogsService.update(id, dto, user?.userId);
    return ResponseUtil.updated(data, '目录更新成功');
  }

  @Delete(':id')
  @RequirePermissions(EQUIPMENT_CATALOG_PERMISSIONS.DELETE)
  @OperationLog({ module: '设备目录管理', action: 'delete' })
  @ApiOperation({ summary: '删除设备目录（软删除）' })
  @ApiResponse({ status: 200, description: '目录删除成功' })
  async remove(@Param('id') id: string) {
    await this.catalogsService.remove(id);
    return ResponseUtil.deleted(null, '目录删除成功');
  }

  @Post('batch-delete')
  @RequirePermissions(EQUIPMENT_CATALOG_PERMISSIONS.DELETE)
  @OperationLog({ module: '设备目录管理', action: 'delete' })
  @ApiOperation({ summary: '批量删除设备目录' })
  @ApiBody({ type: BatchDeleteCatalogsDto })
  @ApiResponse({ status: 200, description: '批量删除成功' })
  async batchDelete(@Body() dto: BatchDeleteCatalogsDto) {
    await this.catalogsService.removeMany(dto.ids);
    return ResponseUtil.deleted(null, '目录批量删除成功');
  }
}
