import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { SoftDeleteService } from './soft-delete.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * SoftDeleteService 6 核心场景（design.md D4 / ADR 0003）
 *
 * mock Prisma delegate —— 不依赖真实 DB，仅校验 service 行为契约。
 */
describe('SoftDeleteService', () => {
  let service: SoftDeleteService;
  let modelDelegate: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    modelDelegate = {
      findFirst: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SoftDeleteService,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    service = module.get<SoftDeleteService>(SoftDeleteService);
  });

  // ============ assertUniqueActive ============

  it('1. 无占用：active 与 soft-deleted 均未命中，应正常返回（不抛错）', async () => {
    modelDelegate.findFirst
      .mockResolvedValueOnce(null) // active check
      .mockResolvedValueOnce(null); // soft-deleted check

    await expect(
      service.assertUniqueActive(modelDelegate, 'name', 'Bosch', {
        errorPrefix: 'EQUIPMENT_BRAND_NAME',
      }),
    ).resolves.toBeUndefined();

    // 校验两次 findFirst 调用的 where 条件
    const [firstCallArgs, secondCallArgs] = modelDelegate.findFirst.mock.calls;
    expect(firstCallArgs[0].where).toEqual({ name: 'Bosch', deletedAt: null });
    expect(secondCallArgs[0].where).toEqual({
      name: 'Bosch',
      deletedAt: { not: null },
    });
  });

  it('2. 活跃占用：未软删除记录命中，应抛 ConflictException({prefix}_DUPLICATED)', async () => {
    modelDelegate.findFirst.mockResolvedValueOnce({ id: 'brand-1' }); // active hit

    await expect(
      service.assertUniqueActive(modelDelegate, 'name', 'Bosch', {
        errorPrefix: 'EQUIPMENT_BRAND_NAME',
      }),
    ).rejects.toMatchObject({
      message: 'EQUIPMENT_BRAND_NAME_DUPLICATED',
      status: 409,
    });
    expect(modelDelegate.findFirst).toHaveBeenCalledTimes(1); // 不再查 soft-deleted
  });

  it('3. 软删除占用：仅软删除记录命中，应抛 ConflictException({prefix}_DUPLICATED_SOFT_DELETED)', async () => {
    modelDelegate.findFirst
      .mockResolvedValueOnce(null) // active miss
      .mockResolvedValueOnce({ id: 'brand-2' }); // soft-deleted hit

    await expect(
      service.assertUniqueActive(modelDelegate, 'name', 'Bosch', {
        errorPrefix: 'EQUIPMENT_BRAND_NAME',
      }),
    ).rejects.toMatchObject({
      message: 'EQUIPMENT_BRAND_NAME_DUPLICATED_SOFT_DELETED',
      status: 409,
    });
  });

  it('4. excludeId 排除自身：更新场景应将 NOT 条件加入两次查询', async () => {
    modelDelegate.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await expect(
      service.assertUniqueActive(modelDelegate, 'name', 'Bosch', {
        errorPrefix: 'EQUIPMENT_BRAND_NAME',
        excludeIdField: 'brandId',
        excludeIdValue: 'self-id',
      }),
    ).resolves.toBeUndefined();

    const [firstCallArgs, secondCallArgs] = modelDelegate.findFirst.mock.calls;
    expect(firstCallArgs[0].where).toEqual({
      name: 'Bosch',
      deletedAt: null,
      NOT: { brandId: 'self-id' },
    });
    expect(secondCallArgs[0].where).toEqual({
      name: 'Bosch',
      deletedAt: { not: null },
      NOT: { brandId: 'self-id' },
    });
  });

  // ============ softDelete ============

  it('5. softDelete：应调用 update 设 deletedAt = now()，where 用业务 ID 字段', async () => {
    modelDelegate.update.mockResolvedValueOnce({});

    await service.softDelete(modelDelegate, 'brandId', 'brand-1');

    expect(modelDelegate.update).toHaveBeenCalledTimes(1);
    const [callArgs] = modelDelegate.update.mock.calls;
    expect(callArgs[0].where).toEqual({ brandId: 'brand-1' });
    expect(callArgs[0].data.deletedAt).toBeInstanceOf(Date);
  });

  // ============ handleUniqueError ============

  it('6. handleUniqueError：P2002 应抛 ConflictException({prefix}_DUPLICATED)，非 P2002 透传原错误', () => {
    const p2002 = new PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.2',
    });

    expect(() =>
      service.handleUniqueError(p2002, 'EQUIPMENT_BRAND_NAME'),
    ).toThrow(ConflictException);
    expect(() =>
      service.handleUniqueError(p2002, 'EQUIPMENT_BRAND_NAME'),
    ).toThrow('EQUIPMENT_BRAND_NAME_DUPLICATED');

    // 非 P2002（如 P2003 外键）应透传
    const p2003 = new PrismaClientKnownRequestError('FK failed', {
      code: 'P2003',
      clientVersion: '6.19.2',
    });
    expect(() =>
      service.handleUniqueError(p2003, 'EQUIPMENT_BRAND_NAME'),
    ).toThrow(p2003);

    // 非 Prisma 错误也应透传
    const generic = new Error('boom');
    expect(() =>
      service.handleUniqueError(generic, 'EQUIPMENT_BRAND_NAME'),
    ).toThrow(generic);

    // Prisma 未知请求错误（非 P2002）也应透传
    const unknown = new Prisma.PrismaClientUnknownRequestError('unknown', {
      clientVersion: '6.19.2',
    });
    expect(() =>
      service.handleUniqueError(unknown, 'EQUIPMENT_BRAND_NAME'),
    ).toThrow(unknown);
  });
});
