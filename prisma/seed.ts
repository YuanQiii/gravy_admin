import { PrismaClient } from '@prisma/client';
import { seedMenus } from './seeds/menus';
import { seedDepartments } from './seeds/department';
import { seedPositions } from './seeds/positions';
import { seedRoles } from './seeds/roles';
import { seedUsers } from './seeds/users';
import { seedDictionaries } from './seeds/dictionaries';
import { seedConfigs } from './seeds/configs';
import { seedPermissionsAndAssignments } from './seeds/permissions';
import { seedNotices } from './seeds/notices';

const prisma = new PrismaClient();

// PostgreSQL advisory lock ID：锁名 'nest_admin_seed' 的 FNV-1a 哈希（TS 侧预计算，保持稳定）
const SEED_LOCK_ID = (() => {
  let h = 0x811c9dc5;
  for (let i = 0; i < 'nest_admin_seed'.length; i++) {
    h ^= 'nest_admin_seed'.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
})();

async function main() {
  console.log('开始初始化数据库...');

  // 加 PostgreSQL 咨询锁，防止多个 seed 进程并发执行导致唯一键冲突。
  // pg_try_advisory_lock + 500ms 退避循环，累计 30 秒未获取则抛错（保留原 MySQL GET_LOCK 的超时语义）
  const LOCK_TIMEOUT_MS = 30_000;
  const LOCK_RETRY_MS = 500;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    const lockResult = await prisma.$queryRaw<
      Array<{ ok: boolean }>
    >`SELECT pg_try_advisory_lock(${SEED_LOCK_ID}::bigint) AS ok`;
    if (lockResult[0]?.ok) break;
    if (Date.now() >= deadline) {
      throw new Error('无法获取 seed 锁，可能有其他 seed 进程正在运行');
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
  }

  try {
    // 1. 初始化菜单数据（目录 + 菜单）
    await seedMenus(prisma);

    // 2. 创建部门
    const { itDepartment, hrDepartment } = await seedDepartments(prisma);

    // 3. 创建岗位
    const { managerPosition, hrPosition } = await seedPositions(prisma);

    // 4. 创建角色
    const { superRole, adminRole, userRole, guestRole } =
      await seedRoles(prisma);

    // 5. 创建权限并分配系统角色权限
    await seedPermissionsAndAssignments(prisma);

    // 6. 创建用户
    const { superUser, adminUser } = await seedUsers(
      prisma,
      { itDepartment, hrDepartment },
      { managerPosition, hrPosition },
      { superRole, adminRole, userRole, guestRole },
    );

    // 6. 创建通知通告数据
    await seedNotices(prisma);

    // 7. 创建字典数据
    await seedDictionaries(prisma);

    // 8. 创建配置数据
    await seedConfigs();

    console.log('数据库初始化完成！');
    const seedPassword = process.env.SUPER_ADMIN_INITIAL_PASSWORD || '未设置';

    console.log('超级管理员账户信息:');
    console.log(`  邮箱: ${superUser.email}`);
    console.log(`  用户名: ${superUser.username}`);
    console.log(`  手机号: ${superUser.phone}`);
    console.log(`  密码: ${seedPassword}`);

    console.log('管理员账户信息:');
    console.log(`  邮箱: ${adminUser.email}`);
    console.log(`  用户名: ${adminUser.username}`);
    console.log(`  手机号: ${adminUser.phone}`);
    console.log(`  密码: ${seedPassword}`);
  } finally {
    // 释放 PostgreSQL 咨询锁（连接断开时也会自动释放）
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${SEED_LOCK_ID}::bigint)`;
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
