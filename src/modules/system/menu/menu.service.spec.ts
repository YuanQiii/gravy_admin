import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { MenuService } from './menu.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('MenuService.remove', () => {
  let service: MenuService;
  let prisma: { menu: { findUnique: jest.Mock; findMany: jest.Mock; delete: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      menu: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<MenuService>(MenuService);
  });

  it('删除仍有子菜单的 MENU 类型时应抛出 ConflictException 而非 500', async () => {
    // 非 CATALOG 类型（MENU），预检查不覆盖子菜单 → FK 约束触发 P2003
    prisma.menu.findUnique.mockResolvedValue({
      menuId: 'menu-1',
      type: 'MENU',
      parentMenuId: null,
    });
    prisma.menu.delete.mockRejectedValue(
      new PrismaClientKnownRequestError(
        'Foreign key constraint failed on the field: `MenuHierarchy_parentMenuId_fkey`',
        { code: 'P2003', clientVersion: '6.19.2' },
      ),
    );

    await expect(service.remove('menu-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
