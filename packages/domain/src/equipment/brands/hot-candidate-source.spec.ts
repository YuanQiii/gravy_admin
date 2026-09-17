import {
  rankHotBrands,
  HOT_BRAND_CANDIDATE_CAP,
  HotRankBrand,
} from './hot-ranking';
import {
  MemoryHotBrandCandidateSource,
} from './hot-candidate-source';

/** 构造参与排序的最小品牌行（同 hot-ranking.spec 的工厂约定）。 */
function brand(
  brandId: string,
  overrides: Partial<HotRankBrand> = {},
): HotRankBrand & { slug?: string } {
  return {
    brandId,
    name: `品牌${brandId}`,
    isHot: false,
    hotOrder: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * 候选集上限的恒等性验证（bound-hot-brand-candidate-set 3.2/3.3）：
 * 上限只截断候选取出量 —— 两段排序键序与全量一致时，rankHotBrands 输出
 * 与"全量取出"逐元素一致（D3 恒等性）。
 */
describe('HotBrandCandidateSource + 候选集上限恒等性', () => {
  it('CAP=200 且导出（1.1）', () => {
    expect(HOT_BRAND_CANDIDATE_CAP).toBe(200);
  });

  it('3.2 超过 200 个品牌：按 CAP 截断候选与全量取出，对外排序一致', () => {
    // 构造 250 个未标记品牌 + 30 个标记品牌（deviceCount 各异、createdAt 各异）
    const all: HotRankBrand[] = [];
    const counts = new Map<string, number>();
    for (let i = 0; i < 250; i++) {
      const id = `p-${String(i).padStart(3, '0')}`;
      all.push(brand(id, { createdAt: new Date(2026, 0, 1, 0, 0, i) }));
      counts.set(id, (i * 7) % 90); // 制造 deviceCount 并列
    }
    for (let i = 0; i < 30; i++) {
      const id = `h-${String(i).padStart(3, '0')}`;
      all.push(
        brand(id, {
          isHot: true,
          hotOrder: i % 5 === 0 ? null : i, // 混入 NULLS LAST
          createdAt: new Date(2026, 0, 2, 0, 0, i),
        }),
      );
      counts.set(id, 100 + i);
    }

    // SQL 语义的截断：两段各自按排序键序取前 CAP 条（与 SqlSource 的 ORDER BY+LIMIT 一致）
    const orderedUnmarked = all
      .filter((b) => !b.isHot)
      .sort(
        (a, b) =>
          (counts.get(b.brandId) ?? 0) - (counts.get(a.brandId) ?? 0) ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      )
      .slice(0, HOT_BRAND_CANDIDATE_CAP);
    const orderedHot = all
      .filter((b) => b.isHot)
      .sort(
        (a, b) =>
          (a.hotOrder ?? Number.MAX_SAFE_INTEGER) -
            (b.hotOrder ?? Number.MAX_SAFE_INTEGER) ||
          (counts.get(b.brandId) ?? 0) - (counts.get(a.brandId) ?? 0) ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      )
      .slice(0, HOT_BRAND_CANDIDATE_CAP);
    const truncated = [...orderedHot, ...orderedUnmarked];

    // 全量 vs 截断：相同 limit 下的对外输出恒等
    for (const limit of [8, 50]) {
      const full = rankHotBrands(all, counts, limit);
      const capped = rankHotBrands(truncated, counts, limit);
      expect(capped.map((b) => b.brandId)).toEqual(full.map((b) => b.brandId));
    }
    // 候选量被观测：截断后总数 = 250 + 30 - (250 - CAP) < 全量
    expect(truncated.length).toBeLessThan(all.length);
  });

  it('3.3 Memory 源给定与 SQL 同序数据：rankHotBrands 输出与纯函数历史用例逐元素一致', async () => {
    const rows = [
      brand('p1', { createdAt: new Date('2026-09-05T00:00:00Z') }),
      brand('h1', { isHot: true, hotOrder: 1 }),
      brand('p2'),
      brand('h2', { isHot: true, hotOrder: null }),
    ];
    const counts = new Map([
      ['p1', 30],
      ['p2', 10],
      ['h1', 5],
      ['h2', 3],
    ]);
    const source = new MemoryHotBrandCandidateSource({
      brands: rows,
      deviceCounts: counts,
    });
    const { brands, deviceCounts } = await source.fetchCandidates({
      visibility: 'anonymous',
    });
    const result = rankHotBrands(brands, deviceCounts, 4);
    // 与既有纯函数用例同序数据：标记段优先（hotOrder 升序，null 殿后），
    // 未标记段 deviceCount 降序
    expect(result.map((b) => b.brandId)).toEqual(['h1', 'h2', 'p1', 'p2']);
    expect(result[0].deviceCount).toBe(5);
  });
});
