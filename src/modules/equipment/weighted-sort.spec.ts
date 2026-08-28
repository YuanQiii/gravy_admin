import { Prisma } from '@prisma/client';
import { Expose } from 'class-transformer';
import { PaginationDto } from '@/shared/dtos/pagination.dto';
import {
  runWeightedSort,
  WeightedField,
  QueryRawExecutor,
} from './weighted-sort';

// Prisma.Sql 对外暴露 strings (raw 段) 与 values (参数化段)，用于断言注入安全。
// 机制以普通参数 $queryRaw(sql) 传入 Prisma.Sql，故可直接读其 strings/values。
interface SqlCaptured {
  strings: string[];
  values: unknown[];
}

function captureQueryRaw(sql: Prisma.Sql): SqlCaptured {
  return { strings: sql.strings, values: sql.values };
}

// 捕获模式 mock：记录每次 $queryRaw 收到的 Prisma.Sql，返回空行集。
// $queryRaw 实现为泛型箭头、返回 Promise.resolve，非 async（避免 require-await），
// 且天然满足 QueryRawExecutor 的泛型签名。
function capturing(): { prisma: QueryRawExecutor; cap: SqlCaptured[] } {
  const cap: SqlCaptured[] = [];
  const prisma: QueryRawExecutor = {
    $queryRaw: <T = unknown>(query: TemplateStringsArray | Prisma.Sql) => {
      cap.push(captureQueryRaw(query as Prisma.Sql));
      return Promise.resolve([] as unknown as T);
    },
  };
  return { prisma, cap };
}

// 返回固定行集的 mock：用于断言 count 调用与 DTO 包络。
function resolving(rows: Record<string, unknown>[]): QueryRawExecutor {
  return {
    $queryRaw: <T = unknown>() => Promise.resolve(rows as unknown as T),
  };
}

// secret 未标注 @Expose，plainToInstance(excludeExtraneousValues) 应剔除
class FakeDto {
  @Expose() id!: string;
  @Expose() name!: string;
  secret!: string;
}

const FIELDS: ReadonlyArray<WeightedField> = [
  { field: 'gencode', weight: 5, isString: true },
  { field: 'weight', weight: 3, isString: false },
];

const pagination = (page = 1, pageSize = 10) => {
  const p = new PaginationDto();
  p.page = page;
  p.pageSize = pageSize;
  return p;
};

describe('runWeightedSort (Completeness-weighted sort)', () => {
  it('用户值全部落入参数化 values，列名/权重全部在 strings（非内联用户输入）', async () => {
    const { prisma, cap } = capturing();
    const conditions: Prisma.Sql[] = [
      Prisma.sql`"deletedAt" IS NULL`,
      Prisma.sql`"status" = ${'enabled'}`,
      Prisma.sql`"model" ILIKE ${'%x1z%'}`,
    ];

    await runWeightedSort<FakeDto>(prisma, {
      table: 'filters',
      fields: FIELDS,
      conditions,
      pagination: pagination(),
      dto: FakeDto,
      count: () => Promise.resolve(0),
    });

    const sql = cap[0];
    const joined = sql.strings.join('?');
    // 用户值在 values（参数化）
    expect(sql.values).toContain('enabled');
    expect(sql.values).toContain('%x1z%');
    // 列名与权重只出现在 strings（编译期常量内联）
    expect(joined).toContain('"gencode"');
    expect(joined).toContain('THEN 5');
    expect(joined).toContain('THEN 3');
    // 用户输入字符串不以内联形式出现在 strings
    expect(joined).not.toContain('enabled');
    expect(joined).not.toContain('x1z');
  });

  it("isString=true 字段判空串（!= ''），isString=false 仅判 IS NOT NULL", async () => {
    const { prisma, cap } = capturing();

    await runWeightedSort<FakeDto>(prisma, {
      table: 'filters',
      fields: FIELDS,
      conditions: [Prisma.sql`"deletedAt" IS NULL`],
      pagination: pagination(),
      dto: FakeDto,
      count: () => Promise.resolve(0),
    });

    const joined = cap[0].strings.join(' ');
    expect(joined).toContain('"gencode" IS NOT NULL AND "gencode" != \'\'');
    expect(joined).toContain('"weight" IS NOT NULL');
    expect(joined).not.toContain('"weight" != ');
  });

  it('ORDER BY 三级结构：加权分 DESC → sortOrder DESC → createdAt DESC', async () => {
    const { prisma, cap } = capturing();

    await runWeightedSort<FakeDto>(prisma, {
      table: 'filters',
      fields: FIELDS,
      conditions: [Prisma.sql`"deletedAt" IS NULL`],
      pagination: pagination(),
      dto: FakeDto,
      count: () => Promise.resolve(0),
    });

    const joined = cap[0].strings.join(' ');
    expect(joined).toContain('"sortOrder" DESC');
    expect(joined).toContain('"createdAt" DESC');
  });

  it('LIMIT/OFFSET 与分页参数一致，且在 params 位置（values）', async () => {
    const { prisma, cap } = capturing();

    await runWeightedSort<FakeDto>(prisma, {
      table: 'filters',
      fields: FIELDS,
      conditions: [Prisma.sql`"deletedAt" IS NULL`],
      pagination: pagination(3, 20),
      dto: FakeDto,
      count: () => Promise.resolve(0),
    });

    const sql = cap[0];
    expect(sql.values).toContain(20); // LIMIT
    expect(sql.values).toContain(40); // OFFSET = (3-1)*20
    expect(sql.strings.join(' ')).toContain('OFFSET');
  });

  it('调用 count thunk 并将 total 写入 PaginationData、透传 page/pageSize', async () => {
    const count = jest.fn(() => Promise.resolve(57));
    const prisma = resolving([
      { id: 'a', name: 'A', secret: 's1' },
      { id: 'b', name: 'B', secret: 's2' },
    ]);

    const result = await runWeightedSort<FakeDto>(prisma, {
      table: 'filters',
      fields: FIELDS,
      conditions: [Prisma.sql`"deletedAt" IS NULL`],
      pagination: pagination(2, 10),
      dto: FakeDto,
      count,
    });

    expect(count).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(57);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
  });

  it('items 经 plainToInstance 排除冗余字段（不暴露 secret 等非 DTO 字段）', async () => {
    const prisma = resolving([{ id: 'a', name: 'A', secret: 's1' }]);

    const result = await runWeightedSort<FakeDto>(prisma, {
      table: 'filters',
      fields: FIELDS,
      conditions: [Prisma.sql`"deletedAt" IS NULL`],
      pagination: pagination(),
      dto: FakeDto,
      count: () => Promise.resolve(1),
    });

    const item = result.items[0];
    expect(result.items).toHaveLength(1);
    expect(item.id).toBe('a');
    expect(item.name).toBe('A');
    // secret 未标注 @Expose，被 excludeExtraneousValues 剔除——不对外暴露。
    expect((item as FakeDto & { secret?: string }).secret).toBeUndefined();
  });

  it('表名来自 service 传入（转为带双引号的 raw 标识符）', async () => {
    const { prisma, cap } = capturing();

    await runWeightedSort<FakeDto>(prisma, {
      table: 'equipment_catalogs',
      fields: FIELDS,
      conditions: [Prisma.sql`"deletedAt" IS NULL`],
      pagination: pagination(),
      dto: FakeDto,
      count: () => Promise.resolve(0),
    });

    expect(cap[0].strings.join(' ')).toContain('"equipment_catalogs"');
  });
});
