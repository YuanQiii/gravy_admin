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
import { InquiryLinesService } from './inquiry-lines.service';
import { CreateInquiryLineDto } from './dto/create-inquiry-line.dto';
import { UpdateInquiryLineDto } from './dto/update-inquiry-line.dto';
import { QueryInquiryLineDto } from './dto/query-inquiry-line.dto';
import { InquiryLineResponseDto } from './dto/inquiry-line-response.dto';
import { BatchDeleteInquiryLinesDto } from './dto/batch-delete-inquiry-lines.dto';
import { RequirePermissions, OperationLog, CurrentUser, ResponseUtil, INQUIRY_LINE_PERMISSIONS, AccessGuard } from '@gvray/core';







@ApiTags('询价单明细管理')
@ApiBearerAuth('JWT-auth')
@Controller('inquiry/inquiry-lines')
@UseGuards(AccessGuard)
export class InquiryLinesController {
  constructor(private readonly inquiryLinesService: InquiryLinesService) {}

  @Post()
  @RequirePermissions(INQUIRY_LINE_PERMISSIONS.CREATE)
  @OperationLog({ module: '询价单明细管理' })
  @ApiOperation({ summary: '创建询价单明细' })
  @ApiResponse({
    status: 201,
    description: '询价单明细创建成功',
    type: InquiryLineResponseDto,
  })
  async create(
    @Body() dto: CreateInquiryLineDto,
    @CurrentUser() user: { userId?: string },
  ) {
    const data = await this.inquiryLinesService.create(dto, user?.userId);
    return ResponseUtil.created(data, '询价单明细创建成功');
  }

  @Get()
  @RequirePermissions(INQUIRY_LINE_PERMISSIONS.LIST)
  @ApiOperation({ summary: '获取询价单明细列表' })
  @ApiResponse({ status: 200, description: '获取询价单明细列表成功' })
  async findAll(@Query() query: QueryInquiryLineDto) {
    const pageData = await this.inquiryLinesService.findAll(query);
    return ResponseUtil.paginated(pageData, '获取询价单明细列表成功');
  }

  @Get(':id')
  @RequirePermissions(INQUIRY_LINE_PERMISSIONS.VIEW)
  @ApiOperation({ summary: '获取询价单明细详情' })
  @ApiResponse({
    status: 200,
    description: '获取询价单明细详情成功',
    type: InquiryLineResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const data = await this.inquiryLinesService.findOne(id);
    return ResponseUtil.found(data, '获取询价单明细详情成功');
  }

  @Patch(':id')
  @RequirePermissions(INQUIRY_LINE_PERMISSIONS.UPDATE)
  @OperationLog({ module: '询价单明细管理', action: 'update' })
  @ApiOperation({ summary: '更新询价单明细' })
  @ApiResponse({
    status: 200,
    description: '询价单明细更新成功',
    type: InquiryLineResponseDto,
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInquiryLineDto,
    @CurrentUser() user: { userId?: string },
  ) {
    const data = await this.inquiryLinesService.update(id, dto, user?.userId);
    return ResponseUtil.updated(data, '询价单明细更新成功');
  }

  @Delete(':id')
  @RequirePermissions(INQUIRY_LINE_PERMISSIONS.DELETE)
  @OperationLog({ module: '询价单明细管理', action: 'delete' })
  @ApiOperation({ summary: '删除询价单明细（软删除）' })
  @ApiResponse({ status: 200, description: '询价单明细删除成功' })
  async remove(@Param('id') id: string) {
    await this.inquiryLinesService.remove(id);
    return ResponseUtil.deleted(null, '询价单明细删除成功');
  }

  @Post('batch-delete')
  @RequirePermissions(INQUIRY_LINE_PERMISSIONS.DELETE)
  @OperationLog({ module: '询价单明细管理', action: 'delete' })
  @ApiOperation({ summary: '批量删除询价单明细' })
  @ApiBody({ type: BatchDeleteInquiryLinesDto })
  @ApiResponse({ status: 200, description: '批量删除成功' })
  async batchDelete(@Body() dto: BatchDeleteInquiryLinesDto) {
    await this.inquiryLinesService.removeMany(dto.ids);
    return ResponseUtil.deleted(null, '询价单明细批量删除成功');
  }
}
