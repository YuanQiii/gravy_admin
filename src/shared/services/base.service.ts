import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { startOfDay, endOfDay } from '../utils/time.util';
import { PaginationDto, PaginationSortDto } from '../dtos/pagination.dto';
import { ResponseUtil } from '../utils/response.util';
import { PaginationResponse } from '../interfaces/response.interface';
import { SUPER_ROLE_KEY } from '../constants/role.constant';

/**
 * 可见性选项。
 * - `'authenticated'`（默认）：登录用户行为，不强制过滤 status。
 * - `'anonymous'`：匿名访客行为，强制 `status='enabled'`、对 disabled 记录抛 404。
 *
 * 由 controller 在调用 service 时按 `@CurrentUser() user` 是否存在传入：
 * `user ? undefined : { visibility: 'anonymous' }`。
 */
export type VisibilityOpts = {
  visibility?: 'anonymous' | 'authenticated';
};

/**
 * 基础服务类
 * 提供通用的CRUD操作和分页查询方法
 */
@Injectable()
export abstract class BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
  ) {}

  /**
   * 按可见性强制过滤查询条件。
   *
   * `visibility === 'anonymous'` 时强制 `where.status = 'enabled'`，
   * **无视**调用方已有 `where.status`（防 query 绕过：匿名访客不能通过
   * `?status=disabled` 看到非启用记录）。
   *
   * `visibility === 'authenticated'`（含未传 opts）时不干预，保留调用方原 where。
   */
  protected applyVisibility(
    where: Record<string, unknown>,
    opts?: VisibilityOpts,
  ): void {
    if (opts?.visibility === 'anonymous') {
      where.status = 'enabled';
    }
  }

  /**
   * 按可见性校验单条记录是否对匿名访客可见。
   *
   * `visibility === 'anonymous'` 且 `record.status !== 'enabled'` 时
   * 抛 `NotFoundException`——与"记录不存在"语义一致，不暴露存在性
   * （即不告诉匿名访客"这条记录是 disabled"，只说"找不到"）。
   *
   * `visibility === 'authenticated'`（含未传 opts）时直接放行。
   */
  protected assertVisible(
    record: { status: string } | null,
    opts?: VisibilityOpts,
  ): void {
    if (opts?.visibility === 'anonymous' && record?.status !== 'enabled') {
      throw new NotFoundException('记录不存在');
    }
  }

  protected async isSuperAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        userRoles: {
          select: { role: { select: { roleKey: true } } },
        },
      },
    });
    return !!user?.userRoles.some((ur) => ur.role.roleKey === SUPER_ROLE_KEY);
  }

  protected buildWhere(params: {
    contains?: Record<string, string | undefined>;
    equals?: Record<string, unknown>;
    boolean?: { field: string; value?: string };
    date?: {
      field: string;
      start?: string;
      end?: string;
    };
  }): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (params.contains) {
      for (const [key, val] of Object.entries(params.contains)) {
        if (val !== undefined && val !== '') {
          where[key] = { contains: val };
        }
      }
    }
    if (params.equals) {
      for (const [key, val] of Object.entries(params.equals)) {
        if (val !== undefined && val !== null) {
          where[key] = val;
        }
      }
    }
    const b = params.boolean;
    if (b?.value !== undefined && b.value !== '') {
      where[b.field] = b.value === 'true' || b.value === '1';
    }
    const d = params.date;
    if (d) {
      if (d.start || d.end) {
        const tzSuffix = this.configService.get<string>(
          'app.tzSuffix',
          '+08:00',
        );
        const o: Record<string, Date> = {};
        if (d.start) o.gte = startOfDay(d.start, tzSuffix);
        if (d.end) o.lte = endOfDay(d.end, tzSuffix);
        where[d.field] = o;
      }
    }
    return where;
  }

  protected getPaginationState(pagination: PaginationDto): {
    skip: number;
    take: number;
    page: number;
    pageSize: number;
  } {
    const skip = pagination.getSkip();
    const take = pagination.getTake();
    return {
      skip,
      take,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  /**
   * 执行分页查询
   * @param model Prisma模型
   * @param pagination 分页参数
   * @param where 查询条件
   * @param include 关联查询
   * @param orderBy 排序条件
   * @returns 分页结果
   */
  protected async paginate<T>(
    model: {
      findMany: (args: {
        where?: Record<string, unknown>;
        include?: Record<string, unknown>;
        orderBy?: Record<string, unknown> | Record<string, unknown>[];
        skip?: number;
        take?: number;
      }) => Promise<T[]>;
      count: (args: { where?: Record<string, unknown> }) => Promise<number>;
    },
    pagination: PaginationDto,
    where?: Record<string, unknown>,
    include?: Record<string, unknown>,
    orderBy?: Record<string, unknown> | Record<string, unknown>[],
  ): Promise<{ items: T[]; total: number; page: number; pageSize: number }> {
    const { page, pageSize } = pagination;
    const skip = pagination.getSkip();
    const take = pagination.getTake();

    const [items, total] = await Promise.all([
      model.findMany({
        where,
        include,
        orderBy,
        skip,
        take,
      }),
      model.count({ where }),
    ]);

    return {
      items,
      total,
      page: page,
      pageSize: pageSize,
    };
  }

  /**
   * 执行分页查询并返回统一格式
   * @param model Prisma模型
   * @param pagination 分页参数
   * @param where 查询条件
   * @param include 关联查询
   * @param orderBy 排序条件
   * @param message 响应消息
   * @param path 请求路径
   * @returns 分页响应
   */
  protected async paginateWithResponse<T>(
    model: {
      findMany: (args?: {
        where?: Record<string, unknown>;
        include?: Record<string, unknown>;
        orderBy?: any;
        skip?: number;
        take?: number;
      }) => Promise<T[]>;
      count: (args?: { where?: Record<string, unknown> }) => Promise<number>;
    },
    pagination: PaginationDto,
    where?: Record<string, unknown>,
    include?: Record<string, unknown>,
    orderBy?: any,
    message?: string,
  ): Promise<PaginationResponse<T>> {
    const result = await this.paginate<T>(
      model,
      pagination,
      where,
      include,
      orderBy,
    );
    const paginationData = {
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };

    return ResponseUtil.paginated(paginationData, message);
  }

  /**
   * 执行分页排序查询
   * @param model Prisma模型
   * @param pagination 分页排序参数
   * @param where 查询条件
   * @param include 关联查询
   * @param defaultSortBy 默认排序字段
   * @returns 分页结果
   */
  protected async paginateWithSort<T>(
    model: {
      findMany: (args: {
        where?: Record<string, unknown>;
        include?: Record<string, unknown>;
        orderBy?: Record<string, unknown>;
        skip?: number;
        take?: number;
      }) => Promise<T[]>;
      count: (args: { where?: Record<string, unknown> }) => Promise<number>;
    },
    pagination: PaginationSortDto,
    where?: Record<string, unknown>,
    include?: Record<string, unknown>,
    defaultSortBy: string = 'createdAt',
  ): Promise<{ items: T[]; total: number; page: number; pageSize: number }> {
    const orderBy = pagination.getOrderBy(defaultSortBy);
    return this.paginate<T>(model, pagination, where, include, orderBy);
  }

  /**
   * 执行分页排序查询并返回统一格式
   * @param model Prisma模型
   * @param pagination 分页排序参数
   * @param where 查询条件
   * @param include 关联查询
   * @param defaultSortBy 默认排序字段
   * @param message 响应消息
   * @param path 请求路径
   * @returns 分页响应
   */
  protected async paginateWithSortAndResponse<T>(
    model: {
      findMany: (args: {
        where?: Record<string, unknown>;
        include?: Record<string, unknown>;
        orderBy?: Record<string, unknown>;
        skip?: number;
        take?: number;
      }) => Promise<T[]>;
      count: (args: { where?: Record<string, unknown> }) => Promise<number>;
    },
    pagination: PaginationSortDto,
    where?: Record<string, unknown>,
    include?: Record<string, unknown>,
    defaultSortBy: string = 'createdAt',
    message?: string,
  ): Promise<PaginationResponse<T>> {
    const result = await this.paginateWithSort<T>(
      model,
      pagination,
      where,
      include,
      defaultSortBy,
    );
    const paginationData = {
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };

    return ResponseUtil.paginated(paginationData, message);
  }

  /**
   * 检查记录是否存在
   * @param model Prisma模型
   * @param where 查询条件
   * @param errorMessage 错误消息
   * @returns 记录
   */
  protected async findOneOrFail<T>(
    model: {
      findUnique: (args: {
        where: Record<string, unknown>;
      }) => Promise<T | null>;
    },
    where: Record<string, unknown>,
    errorMessage: string = '记录不存在',
  ): Promise<T> {
    const record = await model.findUnique({ where });
    if (!record) {
      throw new NotFoundException(errorMessage);
    }
    return record;
  }

  /**
   * 检查记录是否存在（包含关联数据）
   * @param model Prisma模型
   * @param where 查询条件
   * @param include 关联查询
   * @param errorMessage 错误消息
   * @returns 记录
   */
  protected async findOneWithIncludeOrFail<T>(
    model: {
      findUnique: (args: {
        where: Record<string, unknown>;
        include?: Record<string, unknown>;
      }) => Promise<T | null>;
    },
    where: Record<string, unknown>,
    include: Record<string, unknown>,
    errorMessage: string = '记录不存在',
  ): Promise<T> {
    const record = await model.findUnique({ where, include });
    if (!record) {
      throw new NotFoundException(errorMessage);
    }
    return record;
  }
}
