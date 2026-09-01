import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

// 数据权限枚举
export enum DataScope {
  SELF = 1, // 仅本人数据权限
  DEPARTMENT = 2, // 本部门数据权限
  DEPARTMENT_AND_CHILD = 3, // 本部门及以下数据权限
  CUSTOM = 4, // 自定义数据权限
  ALL = 5, // 全部数据权限
}

@Injectable()
export class DataScopeService {
  constructor(private prisma: PrismaService) {}

  /**
   * 为角色分配数据权限
   */
  async assignDataScopeToRole(
    roleId: string,
    dataScope: number,
    departmentIds?: string[],
    createdById?: string,
  ): Promise<{ message: string }> {
    // 更新角色的数据权限
    await this.prisma.role.update({
      where: { roleId },
      data: { dataScope },
    });

    // 如果是自定义权限，需要管理角色-部门关联
    if (dataScope === DataScope.CUSTOM && departmentIds) {
      // 删除现有的角色-部门关联
      await this.prisma.roleDepartment.deleteMany({
        where: { roleId },
      });

      // 创建新的角色-部门关联
      if (departmentIds.length > 0) {
        await this.prisma.roleDepartment.createMany({
          data: departmentIds.map((deptId) => ({
            roleId,
            departmentId: deptId,
            createdById,
          })),
        });
      }
    } else {
      // 如果不是自定义权限，删除所有角色-部门关联
      await this.prisma.roleDepartment.deleteMany({
        where: { roleId },
      });
    }

    return { message: '数据权限分配成功' };
  }

  /**
   * 获取角色的数据权限
   */
  async getRoleDataScope(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: { roleId },
      include: {
        roleDepartments: {
          include: { department: true },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('角色不存在');
    }

    return {
      roleId: role.roleId,
      dataScope: role.dataScope,
      departments: role.roleDepartments.map((rd) => ({
        departmentId: rd.departmentId,
        departmentName: rd.department.name,
      })),
    };
  }
}
