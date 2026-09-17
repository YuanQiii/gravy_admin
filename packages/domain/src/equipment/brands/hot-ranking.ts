/**
 * 热门品牌排序 —— 排序不变量单点（纯函数，零 I/O、零 prisma）。
 *
 * 与 weighted-sort 同属"排序策略与 I/O 分离"先例：Service 只负责选题
 * （候选品牌 + 生效设备数聚合，经 `HotBrandCandidateSource` 取出且受
 * `HOT_BRAND_CANDIDATE_CAP` 约束——上限只截断候选量，两段排序键序与
 * 全量一致，故 `rankHotBrands` 输出恒等），排序规则唯一收敛在本文件的 rankHotBrands。
 * 纯函数可脱离 prisma/DB 直接单测——构造 (brands, deviceCounts, limit)
 * 断言输出顺序即可，不需要 mock 任何数据库访问。
 */

/**
 * 候选集取出上限（bound-hot-brand-candidate-set A2）。
 *
 * 取值依据：展示上限 `HotBrandQueryDto.limit` 最大 50，4× 余量覆盖
 * "标记段或未标记段各自极端倾斜"的分布；**N ≥ limit 时 `rankHotBrands`
 * 的输出与全量取出恒等**（两段各自的排序键序与全量一致，合并切片结果
 * 不可能因截断而变）。仅约束候选取出量、不改变对外结果 —— 取数成本
 * 从 O(全表) 变为 O(CAP)。
 */
export const HOT_BRAND_CANDIDATE_CAP = 200;

/**
 * 参与排序的品牌最小形状。函数只读这些字段，传入的行可带更多属性（额外
 * 字段原样保留于返回结果，供 DTO 包络取用）。
 */
export interface HotRankBrand {
  brandId: string;
  name: string;
  isHot: boolean;
  hotOrder: number | null;
  createdAt: Date;
}

/** rankHotBrands 返回的可读行——原品牌行并拍入生效设备数。 */
export type HotRankedBrand<T extends HotRankBrand> = T & {
  deviceCount: number;
};

/**
 * 合并排序热门品牌：
 *
 * 排序规则（不可变承诺，务必与原实现同步，勿在 findHot 中再复述）——
 * 1. `isHot=true`（运营标记）恒位于 `isHot=false`（按设备数兜底）之前。
 * 2. 标记段内按 `hotOrder` 升序；未设 `hotOrder`（null）的排到该段末尾
 *    （等价 NULLS LAST），空档按 `(deviceCount desc, createdAt desc)`。
 * 3. 未标记段按 `(deviceCount desc, createdAt desc)`。
 * 4. 合并后统一 `slice(0, limit)`；`deviceCount` 一并内嵌进输出行。
 *
 * createdAt 作为同分兜底保证多次调用/翻页顺序稳定。
 */
export function rankHotBrands<T extends HotRankBrand>(
  brands: ReadonlyArray<T>,
  deviceCounts: ReadonlyMap<string, number>,
  limit: number,
): HotRankedBrand<T>[] {
  const withCount = brands.map((b) => ({
    ...b,
    deviceCount: deviceCounts.get(b.brandId) ?? 0,
  }));

  const byCountThenCreated = (
    a: HotRankedBrand<T>,
    b: HotRankedBrand<T>,
  ): number =>
    b.deviceCount - a.deviceCount || b.createdAt.getTime() - a.createdAt.getTime();

  const marker = (
    a: HotRankedBrand<T>,
    b: HotRankedBrand<T>,
  ): number =>
    (a.hotOrder ?? Number.MAX_SAFE_INTEGER) -
    (b.hotOrder ?? Number.MAX_SAFE_INTEGER) ||
    byCountThenCreated(a, b);

  const hot = withCount
    .filter((b) => b.isHot)
    .sort(marker);
  const fallback = withCount
    .filter((b) => !b.isHot)
    .sort(byCountThenCreated);

  return [...hot, ...fallback].slice(0, limit);
}