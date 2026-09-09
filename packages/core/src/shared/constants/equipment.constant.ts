/**
 * 设备/滤清器域常量
 * 枚举值统一使用小写，匹配项目 status 风格（源库大写枚举值迁移时转小写）
 */

// ==================== 引擎能源类型 ====================
export const EQUIPMENT_ENGINE_ENERGY = [
  'diesel',
  'petrol',
  'electric',
  'hybrid',
  'natural_gas',
] as const;

export type EquipmentEngineEnergy = (typeof EQUIPMENT_ENGINE_ENERGY)[number];

export function isEquipmentEngineEnergy(
  value: string,
): value is EquipmentEngineEnergy {
  return (EQUIPMENT_ENGINE_ENERGY as readonly string[]).includes(value);
}

// ==================== 设备/品牌/目录/滤清器类型状态 ====================
export const EQUIPMENT_STATUS = ['enabled', 'disabled'] as const;

export type EquipmentStatus = (typeof EQUIPMENT_STATUS)[number];
