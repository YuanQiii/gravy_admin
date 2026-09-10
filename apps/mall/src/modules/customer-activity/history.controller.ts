import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CustomerActivityService } from './customer-activity.service';
import { QueryHistoryDto } from './dto/query-history.dto';
import { ResponseUtil } from '@gvray/core';

import { CustomerJwtGuard } from '@/core/guards/customer-jwt.guard';
import { CurrentCustomer } from '@/core/decorators/current-customer.decorator';
import { ICustomer } from '@/core/interfaces/customer.interface';

/**
 * 客户浏览历史管理（B2C 登录态）。
 *
 * recordView 由滤清器详情查看流程内部调用，不暴露为公开接口；本控制器仅暴露
 * LIST 与 DELETE。客户身份取自 `@CurrentCustomer()`，仅返回/删除当前客户本人历史。
 */
@ApiTags('客户浏览历史管理')
@ApiBearerAuth('JWT-auth')
@Controller('history')
@UseGuards(CustomerJwtGuard)
export class HistoryController {
  constructor(private readonly activityService: CustomerActivityService) {}

  @Get()
  @ApiOperation({ summary: '获取当前客户浏览历史列表（visitedAt 降序分页）' })
  @ApiResponse({ status: 200, description: '获取浏览历史成功' })
  async findAll(
    @CurrentCustomer() customer: ICustomer,
    @Query() query: QueryHistoryDto,
  ) {
    // 强制限定当前客户，仅返回本人历史；分页按 visitedAt 倒序
    query.customerId = customer.customerId;
    const pageData = await this.activityService.findHistory(query);
    return ResponseUtil.paginated(pageData, '获取浏览历史成功');
  }

  @Delete()
  @ApiOperation({ summary: '清空当前客户全部浏览历史（硬删），返回删除条数' })
  @ApiResponse({ status: 200, description: '浏览历史清空成功' })
  async clearAll(@CurrentCustomer() customer: ICustomer) {
    const result = await this.activityService.clearAllHistory(
      customer.customerId,
    );
    return ResponseUtil.deleted(result, '浏览历史清空成功');
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除浏览历史（硬删，仅限当前客户）' })
  @ApiResponse({ status: 200, description: '浏览历史删除成功' })
  async remove(
    @CurrentCustomer() customer: ICustomer,
    @Param('id') id: string,
  ) {
    await this.activityService.removeHistory(id, customer.customerId);
    return ResponseUtil.deleted(null, '浏览历史删除成功');
  }
}