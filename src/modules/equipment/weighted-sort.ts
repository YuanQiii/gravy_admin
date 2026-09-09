import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { PaginationDto, PaginationData } from '@gvray/core';



/**
 * runWeightedSort 依赖的最小查询引擎——只要求 `$queryRaw`。
 *
 * 结构类型而非 PrismaClient 具体类型：机制只调用这一个方法，任何提供
 * $queryRaw 的实现（PrismaService、测试 mock）皆可注入（accept dependencies,
 * don't create them）。用户侧全部经 $queryRaw 模板字符串参数化。
 */
export type QueryRawExecutor = {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ): Promise<T>;
};

/**
 * Completeness-weighted sort —— B2C 浏览域（anonymous / b2c）的"信息齐全优先"排序机制。
 *
 * 本模块把三个 service 原先各自复制的加权排序实现（SUM-SQL 编译、参数化 raw 查询、
 * 三级稳定翻页排序、count、DTO 包络）收敛为一处深模块：小接口（全是数据）、大实现（机制）。
 * 各 service 只提供模块差异：表名、字段权重表、where→条件、分页参数、DTO 类、count。
 *
 * 排序规则：加权分 DESC → "sortOrder" DESC → "createdAt" DESC（第三级保证同分下翻页稳定）。
 * 注入策略：所有用户输入都经 ${...} 参数化；列名与权重（编译期常量）经 Prisma.raw 内联。
 *
 * 见 CONTEXT.md *Completeness-weighted sort* 词条与 ADR 0005 增补。
 */

/**
 * 加权字段声明——模块数据（字段名/权重/是否字符串）。
 *
 * isString=true 的字段需同时判 `!= ''`（schema 上为 String?，可能存空字符串脏数据）；
 * isString=false 的字段（如 Decimal?）只需 `IS NOT NULL`。
 */
export interface WeightedField {
  field: string;
  weight: number;
  isString: boolean;
}

/**
 * 加权排序规格——由各 service 以"数据"方式提供。
 *
 * - `table`：表名（@@map 后的实际表名，如 "equipment_catalogs"），feeding Prisma.raw 内联。
 * - `fields`：加权字段表与权重。
 * - `conditions`：由 service 构建的参数化 WHERE 条件（已含 "deletedAt" IS NULL 等）。
 * - `pagination`：分页参数，经 getSkip/getTake 取 LIMIT/OFFSET。
 * - `dto`：响应 DTO 类，plainToInstance({ excludeExtraneousValues: true }) 过滤字段。
 * - `count`：count 查询 thunk——供各模块用自带 Prisma where 类型执行，避免泛型强统类型差异。
 */
export interface WeightedSortSpec<DTO> {
  table: string;
  fields: ReadonlyArray<WeightedField>;
  conditions: Prisma.Sql[];
  pagination: PaginationDto;
  dto: new (...args: any[]) => DTO;
  count: () => Promise<number>;
}

/**
 * 由字段权重表编译为静态加权求和 SQL 片段（列名与权重为常量，安全内联）。
 * 例：(CASE WHEN "gencode" IS NOT NULL AND "gencode" != '' THEN 5 ELSE 0 END) + ...
 */
function compileWeightedSumSql(fields: ReadonlyArray<WeightedField>): string {
  return fields
    .map(({ field, weight, isString }) => {
      const condition = isString
        ? `"${field}" IS NOT NULL AND "${field}" != ''`
        : `"${field}" IS NOT NULL`;
      return `(CASE WHEN ${condition} THEN ${weight} ELSE 0 END)`;
    })
    .join(' + ');
}

/**
 * 执行一次 Completeness-weighted sort 查询。
 *
 * 返回 PaginationData<DTO>：items 已经过 DTO 过滤（不暴露 DB 自增 id、token、secret），
 * total 来自 specs.count()，page/pageSize 透传分页参数。
 */
export async function runWeightedSort<DTO>(
  prisma: QueryRawExecutor,
  spec: WeightedSortSpec<DTO>,
): Promise<PaginationData<DTO>> {
  const skip = spec.pagination.getSkip();
  const take = spec.pagination.getTake();
  const sumSql = compileWeightedSumSql(spec.fields);

  // 先组装为单一 Prisma.Sql，再以普通参数传给 $queryRaw。
  // 好处：表名/加权求和（编译期常量）经 Prisma.raw 内联进 strings；
  //      用户条件/分页（运行期输入）经模板插值进 values（参数化）。
  // Prisma.sql 会就地展开嵌套 join/raw，strings 与 values 数组可直接用于测试断言注入安全。
  const sql = Prisma.sql`
    SELECT * FROM ${Prisma.raw(`"${spec.table}"`)}
    WHERE ${Prisma.join(spec.conditions, ' AND ')}
    ORDER BY (${Prisma.raw(sumSql)}) DESC,
    "sortOrder" DESC,
    "createdAt" DESC
    LIMIT ${take} OFFSET ${skip}
  `;

  const rows = await prisma.$queryRaw<Record<string, unknown>[]>(sql);

  const total = await spec.count();

  return {
    items: plainToInstance(spec.dto, rows, {
      excludeExtraneousValues: true,
    }),
    total,
    page: spec.pagination.page,
    pageSize: spec.pagination.pageSize,
  };
}
