import { Prisma } from '@prisma/client';

/**
 * 金额的**编译期约束**（design 决策 9）。
 *
 * 背景：`Decimal(12,2)` 的两位小数在 JS `number` 的浮点相加下会产生误差
 * （`0.1 + 0.2 !== 0.3`），而金额聚合恰恰最容易被"自然地"写成
 * `lines.reduce((a, b) => a + b.subtotal, 0)`。branded type 使聚合函数的
 * 签名只接受 Decimal —— `number` 参与直接编译失败，约定从"注释里的纪律"
 * 变成"签名里的约束"。
 *
 * `toMoney` 是**唯一**的转换入口：`number` → Decimal 的边界（输入解析）
 * 集中在这一处，其余代码拿到的都是已经过 Decimal 化的值。
 */
export type Money = Prisma.Decimal & {
  readonly __money: unique symbol;
};

export function toMoney(value: Prisma.Decimal | number | null): Money | null {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value) as Money;
}
