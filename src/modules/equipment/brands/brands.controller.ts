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
import { RequirePermissions } from '@/core/decorators/permissions.decorator';
import { OperationLog } from '@/core/decorators/operation-log.decorator';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { ResponseUtil } from '@/shared/utils/response.util';
import { EQUIPMENT_BRAND_PERMISSIONS } from '@/shared/constants/permissions.constant';
import { JwtAuthGuard } from '@/core/guards/jwt-auth.guard';
import { GuestWriteGuard } from '@/core/guards/guest-write.guard';
import { RolesGuard } from '@/core/guards/roles.guard';
import { PermissionsGuard } from '@/core/guards/permissions.guard';

@ApiTags('设备品牌管理')
@ApiBearerAuth('JWT-auth')
@Controller('equipment/brands')
@UseGuards(JwtAuthGuard, GuestWriteGuard, RolesGuard, PermissionsGuard)
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
  @RequirePermissions(EQUIPMENT_BRAND_PERMISSIONS.LIST)
  @ApiOperation({ summary: '获取品牌列表' })
  @ApiResponse({ status: 200, description: '获取品牌列表成功' })
  async findAll(@Query() query: QueryBrandDto) {
    const pageData = await this.brandsService.findAll(query);
    return ResponseUtil.paginated(pageData, '获取品牌列表成功');
  }

  @Get(':id')
  @RequirePermissions(EQUIPMENT_BRAND_PERMISSIONS.VIEW)
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
