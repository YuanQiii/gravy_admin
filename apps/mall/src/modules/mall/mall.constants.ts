import type { VisibilityOpts } from '@gvray/core';


/**
 * 商城公开浏览域的固定可见性选项。
 *
 * Mall browse 五个控制器（filters/equipment/catalogs/brands/filter-types）
 * 统一传此常量触发 `applyVisibility`（强制 `status='enabled'`）与加权排序，
 * 避免各控制器手敲 `{ visibility: 'anonymous' }` 字面量导致 enabled-only
 * 触发器散落调用方记忆。frozen 防误改。
 */
export const MALL_OPTS: Readonly<VisibilityOpts> = Object.freeze({
  visibility: 'anonymous',
});