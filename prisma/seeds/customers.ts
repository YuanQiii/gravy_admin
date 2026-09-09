import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/**
 * B2C 客户测试账号 seed。
 *
 * 仅当 `NODE_ENV === 'development'` 时执行，生产路径不受影响。
 * 统一密码 `123456`（bcrypt cost=10），与既有测试用户约定一致；密码不落明文日志。
 */
export async function seedCustomers(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV !== 'development') {
    console.log('非开发环境，跳过客户测试账号 seed');
    return;
  }

  const hashed = await bcrypt.hash('123456', 10);

  const customers = [
    {
      username: 'customer.one',
      email: 'customer.one@example.com',
      phoneNumber: '13900000001',
      nickName: '客户一号',
    },
    {
      username: 'customer.two',
      email: 'customer.two@example.com',
      phoneNumber: '13900000002',
      nickName: '客户二号',
    },
  ];

  for (const c of customers) {
    await prisma.customer.upsert({
      where: { username: c.username },
      update: {},
      create: {
        username: c.username,
        email: c.email,
        phoneNumber: c.phoneNumber,
        nickName: c.nickName,
        password: hashed,
        avatar: '',
        status: 'enabled',
      },
    });
    console.log(`客户测试账号创建/更新成功: ${c.username}`);
  }

  console.log('✅ 客户测试账号（customer.one / customer.two）创建成功，统一密码: 123456');
}