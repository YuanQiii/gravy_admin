import {
  rankHotBrands,
  HotRankBrand,
} from './hot-ranking';

/** 构造参与排序的最小品牌行。 */
function brand(
  brandId: string,
  overrides: Partial<HotRankBrand> = {},
): HotRankBrand {
  return {
    brandId,
    name: brandId,
    isHot: false,
    hotOrder: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('rankHotBrands (热门品牌合并排序)', () => {
  it('运营标记（isHot）恒优先于未标记品牌', () => {
    const hot = brand('hot', { isHot: true, hotOrder: 0 });
    const plain = brand('plain');
    const result = rankHotBrands([plain, hot], new Map(), 10);
    expect(result.map((b) => b.brandId)).toEqual(['hot', 'plain']);
  });

  it('标记段内按 hotOrder 升序；未设 hotOrder 的排到段末（多计数不越过已设序）', () => {
    const a = brand('a', { isHot: true, hotOrder: 1 });
    const b = brand('b', { isHot: true, hotOrder: 2 });
    const c = brand('c', { isHot: true, hotOrder: null });
    // c 虽然设备数最多，但因未设 hotOrder 排最后
    const counts = new Map([['a', 1], ['b', 1], ['c', 999]]);
    const result = rankHotBrands([c, b, a], counts, 10);
    expect(result.map((b) => b.brandId)).toEqual(['a', 'b', 'c']);
  });

  it('未标记段按生效设备数降序补足', () => {
    const a = brand('a');
    const b = brand('b');
    const counts = new Map([
      ['a', 5],
      ['b', 50],
    ]);
    const result = rankHotBrands([a, b], counts, 10);
    expect(result.map((b) => b.brandId)).toEqual(['b', 'a']);
  });

  it('同设备数/同 hotOrder 用 createdAt 兜底稳定排序', () => {
    const a = brand('a', { createdAt: new Date('2024-01-01T00:00:00Z') });
    const b = brand('b', { createdAt: new Date('2024-01-02T00:00:00Z') });
    const counts = new Map([
      ['a', 5],
      ['b', 5],
    ]);
    const result = rankHotBrands([a, b], counts, 10);
    expect(result.map((x) => x.brandId)).toEqual(['b', 'a']);
  });

  it('截取 limit；deviceCount 内嵌进输出行', () => {
    const a = brand('a');
    const b = brand('b');
    const c = brand('c');
    const counts = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    const result = rankHotBrands([a, b, c], counts, 2);
    expect(result).toHaveLength(2);
    expect(result).toEqual([
      expect.objectContaining({ brandId: 'c', deviceCount: 3 }),
      expect.objectContaining({ brandId: 'b', deviceCount: 2 }),
    ]);
  });

  it('设备数缺省（不在 map）按 0 计', () => {
    const a = brand('a');
    const result = rankHotBrands([a], new Map(), 10);
    expect(result[0].deviceCount).toBe(0);
  });

  it('标记段占用名额后，未标记只补足到 limit', () => {
    const h1 = brand('h1', { isHot: true, hotOrder: 0 });
    const h2 = brand('h2', { isHot: true, hotOrder: 1 });
    const p1 = brand('p1');
    const p2 = brand('p2');
    const counts = new Map([
      ['h1', 0],
      ['h2', 0],
      ['p1', 10],
      ['p2', 20],
    ]);
    const result = rankHotBrands([h1, h2, p1, p2], counts, 2);
    expect(result.map((b) => b.brandId)).toEqual(['h1', 'h2']);
  });
});