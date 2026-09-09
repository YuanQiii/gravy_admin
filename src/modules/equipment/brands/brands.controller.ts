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
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { QueryBrandDto } from './dto/query-brand.dto';
import { BrandResponseDto } from './dto/brand-response.dto';
import { BatchDeleteBrandsDto } from './dto/batch-delete-brands.dto';
import { HotBrandQueryDto } from './dto/hot-brand-query.dto';
import { HotStatusBrandsDto } from './dto/hot-status-brands.dto';
import { RequirePermissions, OperationLog, CurrentUser, ResponseUtil, EQUIPMENT_BRAND_PERMISSIONS, EQUIPMENT_HOT_BRAND_PERMISSIONS, AccessGuard } from '@gvray/core';







@ApiTags('设备品牌管理')
@ApiBearerAuth('JWT-auth')
@Controller('equipment/brands')
@UseGuards(AccessGuard)
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Post()
  @RequirePermissions(EQUIPMENT_BRAND_PERMISSIONS.CREATE)
  @OperationLog({ module: '设备品牌管理' })
  @ApiOperation({ summary: '创建设备品牌' })
  @ApiResponse({
    status: 201,
    description: '品牌创建成功',
    type: BrandResponseDto,
  })
  async create(
    @Body() dto: CreateBrandDto,
    @CurrentUser() user: { userId?: string },
  ) {
    const data = await this.brandsService.create(dto, user?.userId);
    return ResponseUtil.created(data, '品牌创建成功');
  }

  @Get()
  @RequirePermissions(EQUIPMENT_BRAND_PERMISSIONS.VIEW)
  @OperationLog({ module: '设备品牌管理', action: 'view' })
  @ApiOperation({ summary: '获取品牌列表' })
  @ApiResponse({ status: 200, description: '获取品牌列表成功' })
  async findAll(@Query() query: QueryBrandDto) {
    const pageData = await this.brandsService.findAll(query);
    return ResponseUtil.paginated(pageData, '获取品牌列表成功');
  }

  /**
   * 热门品牌列表（B2C 已迁至 GET /b2c/brands/hot，本端点保留给后台）。
   */
  @Get('hot')
  @RequirePermissions(EQUIPMENT_BRAND_PERMISSIONS.VIEW)
  @OperationLog({ module: '设备品牌管理', action: 'view' })
  @ApiOperation({
    summary: '获取热门品牌列表',
    description: '运营标记优先、未标记按生效设备数补足',
  })
  @ApiResponse({ status: 200, description: '获取热门品牌列表成功' })
  async findHot(@Query() query: HotBrandQueryDto) {
    const data = await this.brandsService.findHot(query);
    return ResponseUtil.found(data, '获取热门品牌列表成功');
  }

  @Get(':id')
  @RequirePermissions(EQUIPMENT_BRAND_PERMISSIONS.VIEW)
  @OperationLog({ module: '设备品牌管理', action: 'view' })
  @ApiOperation({ summary: '获取品牌详情' })
  @ApiResponse({
    status: 200,
    description: '获取品牌详情成功',
    type: BrandResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const data = await this.brandsService.findOne(id);
    return ResponseUtil.found(data, '获取品牌详情成功');
  }

  @Patch(':id')
  @RequirePermissions(EQUIPMENT_BRAND_PERMISSIONS.UPDATE)
  @OperationLog({ module: '设备品牌管理', action: 'update' })
  @ApiOperation({ summary: '更新品牌' })
  @ApiResponse({
    status: 200,
    description: '品牌更新成功',
    type: BrandResponseDto,
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBrandDto,
    @CurrentUser() user: { userId?: string },
  ) {
    const data = await this.brandsService.update(id, dto, user?.userId);
    return ResponseUtil.updated(data, '品牌更新成功');
  }

  /**
   * 配置热门品牌状态（单条 ids=[id] 与批量同接口）。热门字段仅经此端点维护，
   * 普通品牌更新（PATCH /:id）不承载 isHot/hotOrder。
   */
  @Post('hot-status')
  @RequirePermissions(EQUIPMENT_HOT_BRAND_PERMISSIONS.UPDATE)
  @OperationLog({ module: '设备品牌管理', action: 'update' })
  @ApiOperation({ summary: '配置热门品牌状态' })
  @ApiBody({ type: HotStatusBrandsDto })
  @ApiResponse({ status: 200, description: '热门品牌状态配置成功' })
  async updateHotStatus(@Body() dto: HotStatusBrandsDto) {
    const data = await this.brandsService.updateHotStatus(dto);
    return ResponseUtil.updated(data, '热门品牌状态配置成功');
  }

  @Delete(':id')
  @RequirePermissions(EQUIPMENT_BRAND_PERMISSIONS.DELETE)
  @OperationLog({ module: '设备品牌管理', action: 'delete' })
  @ApiOperation({ summary: '删除品牌（软删除）' })
  @ApiResponse({ status: 200, description: '品牌删除成功' })
  async remove(@Param('id') id: string) {
    await this.brandsService.remove(id);
    return ResponseUtil.deleted(null, '品牌删除成功');
  }

  @Post('batch-delete')
  @RequirePermissions(EQUIPMENT_BRAND_PERMISSIONS.DELETE)
  @OperationLog({ module: '设备品牌管理', action: 'delete' })
  @ApiOperation({ summary: '批量删除品牌' })
  @ApiBody({ type: BatchDeleteBrandsDto })
  @ApiResponse({ status: 200, description: '批量删除成功' })
  async batchDelete(@Body() dto: BatchDeleteBrandsDto) {
    await this.brandsService.removeMany(dto.ids);
    return ResponseUtil.deleted(null, '品牌批量删除成功');
  }
}
