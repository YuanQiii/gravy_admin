import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, VisibilityOpts, isB2cVisibility } from '@gvray/core';
import {
  HotRankBrand,
  HOT_BRAND_CANDIDATE_CAP,
} from './hot-ranking';

/** 候选品牌行（brandId 非空断言后）。 */
export type HotCandidateBrand = HotRankBrand & { slug?: string };

/** 候选集取出产物：两段候选品牌 + 全局生效设备数（品牌 → 数量）。 */
export interface HotCandidateSet {
  brands: HotCandidateBrand[];
  deviceCounts: Map<string, number>;
}

/**
 * 热门品牌候选源（bound-hot-brand-candidate-set A1）——
 * 「选出候选 + 算生效设备数」与「排序」的 seam：\`BrandsService.findHot\`
 * 只依赖本接口，排序不变量仍唯一在 \`rankHotBrands\`。
 */
export interface HotBrandCandidateSource {
  fetchCandidates(opts: VisibilityOpts): Promise<HotCandidateSet>;
}

/**
 * SQL 实现：两条**受限**查询替代原先的全表 findMany + groupBy。
 *
 * - 标记段（isHot=true）与未标记段（isHot=false）各 LIMIT \`HOT_BRAND_CANDIDATE_CAP\`；
 * - ORDER BY **精确表达** \`rankHotBrands\` 的 tie-break
 *   （标记段 \`hotOrder ASC NULLS LAST, deviceCount DESC, createdAt DESC\`；
 *   未标记段 \`deviceCount DESC, createdAt DESC\`），使截断后的两段排序键序
 *   与全量一致 —— 这是"候选截断不改变对外结果"恒等性的前提；
 * - \`deviceCount\` 经相关子查询在 SQL 内计算（仅计未软删且 enabled 设备）。
 *
 * \`rankHotBrands\` 随后对候选**重新排序**，输出与全量取出逐元素一致
 * （由"SQL 保序"单测断言，见 D3 恒等性）。
 */
@Injectable()
export class SqlHotBrandCandidateSource implements HotBrandCandidateSource {
  /** SELECT 公共列（与原 findMany 的 select 一致）。 */
  private static readonly COLUMNS = Prisma.sql`
    "brandId", "name", "slug", "isHot", "hotOrder", "createdAt"`;

  constructor(private readonly prisma: PrismaService) {}

  async fetchCandidates(opts: VisibilityOpts): Promise<HotCandidateSet> {
    // 可见性：B2C/匿名 → status='enabled'（与 applyVisibility 同语义）
    const statusFilter = isB2cVisibility(opts)
      ? Prisma.sql`AND "status" = 'enabled'`
      : Prisma.sql``;
    const cap = HOT_BRAND_CANDIDATE_CAP;

    const [hotRows, fallbackRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<HotCandidateBrand[]>(Prisma.sql`
        SELECT ${SqlHotBrandCandidateSource.COLUMNS},
               (SELECT COUNT(*) FROM "equipment" e
                 WHERE e."brandId" = b."brandId"
                   AND e."deletedAt" IS NULL
                   AND e."status" = 'enabled') AS "deviceCount"
        FROM "equipment_brands" b
        WHERE b."deletedAt" IS NULL${statusFilter} AND b."isHot" = true
        ORDER BY "hotOrder" ASC NULLS LAST,
                 "deviceCount" DESC,
                 "createdAt" DESC
        LIMIT ${cap}`),
      this.prisma.$queryRaw<HotCandidateBrand[]>(Prisma.sql`
        SELECT ${SqlHotBrandCandidateSource.COLUMNS},
               (SELECT COUNT(*) FROM "equipment" e
                 WHERE e."brandId" = b."brandId"
                   AND e."deletedAt" IS NULL
                   AND e."status" = 'enabled') AS "deviceCount"
        FROM "equipment_brands" b
        WHERE b."deletedAt" IS NULL${statusFilter} AND b."isHot" = false
        ORDER BY "deviceCount" DESC NULLS LAST,
                 "createdAt" DESC
        LIMIT ${cap}`),
      this.prisma.$queryRaw<Array<{ brandId: string; cnt: bigint }>>(Prisma.sql`
        SELECT e."brandId", COUNT(*) AS "cnt"
        FROM "equipment" e
        WHERE e."deletedAt" IS NULL AND e."status" = 'enabled'
          AND e."brandId" IS NOT NULL
        GROUP BY e."brandId"`),
    ]);

    const deviceCounts = new Map<string, number>(
      countRows.map((r) => [r.brandId, Number(r.cnt)]),
    );

    // $queryRaw 不做 camelCase 映射：列别名即返回键。这里列名本就是 camelCase
    // 带引号定义，故返回键与实体属性一致。
    return { brands: [...hotRows, ...fallbackRows], deviceCounts };
  }
}

/** 测试实现：原样返回给定数据，零 DB。 */
@Injectable()
export class MemoryHotBrandCandidateSource implements HotBrandCandidateSource {
  constructor(private readonly set: HotCandidateSet) {}
  fetchCandidates(_opts: VisibilityOpts): Promise<HotCandidateSet> {
    return Promise.resolve(this.set);
  }
}
