import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { DepartmentsService } from './departments.service';
import { PrismaService } from '@gvray/core';


describe('DepartmentsService.remove', () => {
  let service: DepartmentsService;
  let prisma: {
    department: { findUnique: jest.Mock; delete: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      department: {
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<DepartmentsService>(DepartmentsService);
  });

  it('预检查通过但删除时仍被外键约束拦截（竞态）应抛出 ConflictException 而非 500', async () => {
    // 预检查通过（无子部门、无用户）
    prisma.department.findUnique.mockResolvedValue({
      departmentId: 'dept-1',
      children: [],
      users: [],
    });
    // 竞态窗口：check 与 delete 之间新增了子部门 → FK 约束触发
    prisma.department.delete.mockRejectedValue(
      new PrismaClientKnownRequestError(
        'Foreign key constraint failed on the field: `DepartmentHierarchy_parentId_fkey`',
        { code: 'P2003', clientVersion: '6.19.2' },
      ),
    );

    await expect(service.remove('dept-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
