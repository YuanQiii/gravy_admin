import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, BaseService, PaginationData, UserStatus, SUPER_ROLE_KEY, PermissionCacheService, startOfDay, endOfDay } from '@gvray/core';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import * as bcrypt from 'bcrypt';

import { QueryUserDto } from './dto/query-user.dto';
import { Prisma } from '@prisma/client';





import { plainToInstance } from 'class-transformer';


/**
 * User 响应投影：单实体回查与列表查询统一复用的 select 形状
 * 收敛自原先在多个方法中逐字复制的 select 块，避免新增字段需要多处同步
 */
const USER_RESPONSE_SELECT = {
  userId: true,
  email: true,
  username: true,
  nickname: true,
  phone: true,
  avatar: true,
  gender: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  userRoles: {
    select: {
      role: {
        select: {
          roleId: true,
          name: true,
        },
      },
    },
  },
  department: {
    select: {
      departmentId: true,
      name: true,
    },
  },
  userPositions: {
    select: {
      position: {
        select: {
          positionId: true,
          name: true,
        },
      },
    },
  },
} as const;

/**
 * User 分页列表投影：与 USER_RESPONSE_SELECT 一致但刻意不含 description
 * （列表负载最小化；description 仅单实体回查返回）
 */
const USER_LIST_SELECT = {
  userId: true,
  email: true,
  username: true,
  nickname: true,
  phone: true,
  avatar: true,
  gender: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  userRoles: {
    select: {
      role: {
        select: {
          roleId: true,
          name: true,
        },
      },
    },
  },
  department: {
    select: {
      departmentId: true,
      name: true,
    },
  },
  userPositions: {
    select: {
      position: {
        select: {
          positionId: true,
          name: true,
        },
      },
    },
  },
} as const;

@Injectable()
export class UsersService extends BaseService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly configService: ConfigService,
    private readonly permissionCache: PermissionCacheService,
  ) {
    super(prisma, configService);
  }

  /**
   * 回查用户并转换为响应 DTO
   * 统一持有 User 关系投影（USER_RESPONSE_SELECT），单实体回查站点复用
   */
  private async findUserForResponse(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: USER_RESPONSE_SELECT,
    });
    if (!user) {
      throw new NotFoundException(`用户ID ${userId} 不存在`);
    }
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * 层级保护：非超级管理员不能操作超级管理员
   * @param targetUserId 目标用户ID
   * @param currentUserId 当前操作用户ID
   * @param action 操作描述（用于异常消息）
   */
  private async checkSuperAdminHierarchy(
    targetUserId: string,
    currentUserId?: string,
    action = '操作',
  ): Promise<void> {
    if (
      currentUserId &&
      (await this.isSuperAdmin(targetUserId)) &&
      currentUserId !== targetUserId
    ) {
      throw new ForbiddenException(`无权${action}超级管理员`);
    }
  }

  /**
   * 检查角色ID列表中是否包含超级管理员角色
   * @param roleIds 角色ID列表
   * @returns 是否包含超级管理员角色
   */
  private async containsSuperAdminRole(roleIds: string[]): Promise<boolean> {
    if (!roleIds || roleIds.length === 0) {
      return false;
    }

    const roles = await this.prisma.role.findMany({
      where: { roleId: { in: roleIds } },
      select: { roleKey: true },
    });

    return roles.some((role) => role.roleKey === SUPER_ROLE_KEY);
  }

  private async countSuperAdminUsers(): Promise<number> {
    return this.prisma.user.count({
      where: {
        userRoles: {
          some: {
            role: {
              roleKey: SUPER_ROLE_KEY,
            },
          },
        },
      },
    });
  }

  private async validateRoleIds(roleIds: string[]): Promise<void> {
    if (!roleIds || roleIds.length === 0) {
      return;
    }

    const count = await this.prisma.role.count({
      where: { roleId: { in: roleIds } },
    });
    if (count !== new Set(roleIds).size) {
      throw new NotFoundException('部分角色不存在');
    }
  }

  /**
   * 校验角色变更操作的前置约束（assignRoles/removeRoles 共有部分）
   * 目标用户存在、不能修改自己的角色、层级保护、角色ID有效
   * @returns 目标用户（供后续关联写入复用）
   */
  private async assertRoleMutationAllowed(
    userId: string,
    currentUserId: string | undefined,
    roleIds: string[],
  ): Promise<{ userId: string }> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
    });

    if (!user) {
      throw new NotFoundException(`用户ID ${userId} 不存在`);
    }

    if (userId === currentUserId) {
      throw new ForbiddenException('不能修改自己的角色');
    }

    await this.checkSuperAdminHierarchy(userId, currentUserId, '修改角色');

    await this.validateRoleIds(roleIds);

    return { userId: user.userId };
  }

  async create(
    createUserDto: CreateUserDto,
    currentUserId?: string,
  ): Promise<UserResponseDto> {
    const { password, departmentId, positionIds, ...rest } = createUserDto;

    // 检查邮箱是否已存在（如果提供了邮箱）
    if (rest.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: rest.email },
      });
      if (existingUser) {
        throw new ConflictException('邮箱已被注册');
      }
    }

    // 检查用户名是否已存在
    if (rest.username) {
      const existingUser = await this.prisma.user.findUnique({
        where: { username: rest.username },
      });
      if (existingUser) {
        throw new ConflictException('用户名已被注册');
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // 验证部门是否存在
    if (departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { departmentId: departmentId },
      });
      if (!department) {
        throw new NotFoundException('部门不存在');
      }
    }

    // 验证岗位是否存在
    if (positionIds && positionIds.length > 0) {
      const positions = await this.prisma.position.findMany({
        where: { positionId: { in: positionIds } },
      });
      if (positions.length !== positionIds.length) {
        throw new NotFoundException('部分岗位不存在');
      }
    }

    const user = await this.prisma.user.create({
      data: {
        ...rest,
        password: hashedPassword,
        department: departmentId ? { connect: { departmentId } } : undefined,
        // 岗位关联将在创建用户后单独处理
        status: rest.status ?? UserStatus.ENABLED,
        createdBy: currentUserId
          ? { connect: { userId: currentUserId } }
          : undefined,
      },
      include: {
        department: true,
        userPositions: {
          include: {
            position: true,
          },
        },
      },
    });

    // 创建用户岗位关联
    if (positionIds && positionIds.length > 0) {
      await this.prisma.userPosition.createMany({
        data: positionIds.map((positionId) => ({
          userId: user.userId,
          positionId: positionId,
          createdById: currentUserId,
        })),
      });
    }

    // 初始化用户默认偏好设置
    await this.prisma.userSettings.create({
      data: {
        userId: user.userId,
        settings: {
          theme: 'light',
          language: 'zh-CN',
          sidebarCollapsed: false,
          pageSize: 10,
          timezone: 'Asia/Shanghai',
          showWatermark: true,
          enableNotification: true,
          colorScheme: 'default',
        },
      },
    });

    // 重新查询用户以获取完整的关联数据
    return this.findUserForResponse(user.userId);
  }

  async findAll(
    query: QueryUserDto = new QueryUserDto(),
  ): Promise<PaginationData<UserResponseDto>> {
    // 构建查询条件
    const where: Prisma.UserWhereInput = {};

    if (query?.keyword) {
      where.OR = [
        { username: { contains: query.keyword } },
        { nickname: { contains: query.keyword } },
        { phone: { contains: query.keyword } },
        { email: { contains: query.keyword } },
      ];
    }

    if (query?.username) {
      where.username = {
        contains: query.username,
      };
    }

    if (query?.nickname) {
      where.nickname = {
        contains: query.nickname,
      };
    }

    if (query?.phone) {
      where.phone = {
        contains: query.phone,
      };
    }

    if (query?.status !== undefined) {
      where.status = query.status;
    }

    if (query?.createdAtStart || query?.createdAtEnd) {
      const tzSuffix = this.configService.get<string>('app.tzSuffix', '+08:00');
      where.createdAt = {};
      if (query.createdAtStart) {
        where.createdAt.gte = startOfDay(query.createdAtStart, tzSuffix);
      }
      if (query.createdAtEnd) {
        where.createdAt.lte = endOfDay(query.createdAtEnd, tzSuffix);
      }
    }

    const state = this.getPaginationState(query);
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_LIST_SELECT,
        orderBy: [{ createdAt: 'desc' }],
        skip: state.skip,
        take: state.take,
      }),
      this.prisma.user.count({ where }),
    ]);
    const transformed = plainToInstance(UserResponseDto, items, {
      excludeExtraneousValues: true,
    });
    return {
      items: transformed,
      total,
      page: state.page,
      pageSize: state.pageSize,
    };
  }

  async findOne(userId: string): Promise<UserResponseDto> {
    return this.findUserForResponse(userId);
  }

  async update(
    userId: string,
    updateUserDto: UpdateUserDto,
    currentUserId?: string,
  ): Promise<UserResponseDto> {
    const { departmentId, positionIds, ...rest } = updateUserDto;

    const user = await this.prisma.user.findUnique({
      where: { userId },
    });

    if (!user) {
      throw new NotFoundException(`用户ID ${userId} 不存在`);
    }

    if (
      userId === currentUserId &&
      updateUserDto.status === UserStatus.DISABLED
    ) {
      throw new ForbiddenException('不能禁用自己账号');
    }

    // 不能禁用导致活跃超级管理员少于 2 个
    if (
      updateUserDto.status === UserStatus.DISABLED &&
      (await this.isSuperAdmin(userId))
    ) {
      const activeSuperAdminCount = await this.prisma.user.count({
        where: {
          status: UserStatus.ENABLED,
          userRoles: {
            some: {
              role: {
                roleKey: SUPER_ROLE_KEY,
              },
            },
          },
        },
      });
      if (activeSuperAdminCount <= 2) {
        throw new ForbiddenException('不能禁用导致活跃超级管理员少于 2 个');
      }
    }

    await this.checkSuperAdminHierarchy(userId, currentUserId, '修改');

    // 验证部门是否存在
    if (departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { departmentId: departmentId },
      });
      if (!department) {
        throw new NotFoundException('部门不存在');
      }
    }

    // 验证岗位是否存在
    if (positionIds && positionIds.length > 0) {
      const positions = await this.prisma.position.findMany({
        where: { positionId: { in: positionIds } },
      });
      if (positions.length !== positionIds.length) {
        throw new NotFoundException('部分岗位不存在');
      }
    }

    // 先删除现有的关联关系
    if (positionIds !== undefined) {
      await this.prisma.userPosition.deleteMany({
        where: { userId: user.userId },
      });
    }

    await this.prisma.user.update({
      where: { userId: user.userId },
      data: {
        ...rest,
        department: departmentId ? { connect: { departmentId } } : undefined,
        updatedBy: currentUserId
          ? { connect: { userId: currentUserId } }
          : undefined,
      },
    });

    // 创建新的岗位关联
    if (positionIds && positionIds.length > 0) {
      await this.prisma.userPosition.createMany({
        data: positionIds.map((positionId) => ({
          userId: user.userId,
          positionId,
          createdById: currentUserId,
        })),
      });
    }

    if (rest.status !== undefined) {
      await this.permissionCache.invalidateUser(userId);
    }

    // 重新查询用户以获取完整的关联数据
    return this.findUserForResponse(user.userId);
  }

  async resetPassword(
    userId: string,
    newPassword: string,
    currentUserId?: string,
  ): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
    });

    if (!user) {
      throw new NotFoundException(`用户ID ${userId} 不存在`);
    }

    // 超级管理员密码只能由本人重置
    if (
      currentUserId &&
      (await this.isSuperAdmin(userId)) &&
      currentUserId !== userId
    ) {
      throw new ForbiddenException('超级管理员密码只能由本人重置');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { userId: user.userId },
      data: {
        password: hashedPassword,
        updatedBy: currentUserId
          ? { connect: { userId: currentUserId } }
          : undefined,
      },
    });

    // 重新查询用户以获取完整的关联数据
    return this.findUserForResponse(user.userId);
  }

  async remove(userId: string, currentUserId?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
    });

    if (!user) {
      throw new NotFoundException(`用户ID ${userId} 不存在`);
    }

    if (userId === currentUserId) {
      throw new ForbiddenException('不能删除自己账号');
    }

    await this.checkSuperAdminHierarchy(userId, currentUserId, '删除');

    if (
      (await this.isSuperAdmin(userId)) &&
      (await this.countSuperAdminUsers()) <= 2
    ) {
      throw new ForbiddenException('不能删除导致超级管理员少于 2 个');
    }

    try {
      await this.prisma.user.delete({
        where: { userId: user.userId },
      });
    } catch (error) {
      // 数据库原生外键约束：用户仍被其他记录引用（P2003）时返回业务冲突错误而非 500
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          `该用户仍被其他数据引用，无法删除（userId: ${userId}）`,
        );
      }
      throw error;
    }
    return;
  }

  // 为用户分配角色
  async assignRoles(
    userId: string,
    roleIds: string[],
    currentUserId: string,
  ): Promise<UserResponseDto> {
    await this.assertRoleMutationAllowed(userId, currentUserId, roleIds);

    const containsSuperRole = await this.containsSuperAdminRole(roleIds);

    // 非超管不能把任何人提升为超管
    if (containsSuperRole && !(await this.isSuperAdmin(currentUserId))) {
      throw new ForbiddenException('无权分配超级管理员角色');
    }

    const targetIsSuperAdmin = await this.isSuperAdmin(userId);
    if (
      targetIsSuperAdmin &&
      !containsSuperRole &&
      (await this.countSuperAdminUsers()) <= 2
    ) {
      throw new ForbiddenException('至少保留 2 个超级管理员');
    }

    // 先删除现有的角色关联
    await this.prisma.userRole.deleteMany({
      where: { userId },
    });

    // 创建新的角色关联
    if (roleIds && roleIds.length > 0) {
      await this.prisma.userRole.createMany({
        data: roleIds.map((roleId) => ({
          userId,
          roleId,
          createdById: currentUserId,
        })),
      });
    }

    await this.prisma.user.update({
      where: { userId },
      data: { updatedById: currentUserId },
    });

    await this.permissionCache.invalidateUser(userId);

    return this.findUserForResponse(userId);
  }

  // 移除用户的角色
  async removeRoles(
    userId: string,
    roleIds: string[],
    currentUserId?: string,
  ): Promise<UserResponseDto> {
    await this.assertRoleMutationAllowed(userId, currentUserId, roleIds);

    const removesSuperRole = await this.containsSuperAdminRole(roleIds);
    if (
      removesSuperRole &&
      (await this.isSuperAdmin(userId)) &&
      (await this.countSuperAdminUsers()) <= 2
    ) {
      throw new ForbiddenException('至少保留 2 个超级管理员');
    }

    // 删除指定的角色关联
    if (roleIds && roleIds.length > 0) {
      await this.prisma.userRole.deleteMany({
        where: {
          userId,
          roleId: { in: roleIds },
        },
      });
    }

    await this.prisma.user.update({
      where: { userId },
      data: { updatedById: currentUserId },
    });

    await this.permissionCache.invalidateUser(userId);

    return this.findUserForResponse(userId);
  }

  async removeMany(ids: string[], currentUserId?: string): Promise<void> {
    if (currentUserId && ids.includes(currentUserId)) {
      throw new ForbiddenException('不能删除自己账号');
    }

    const users = await this.prisma.user.findMany({
      where: { userId: { in: ids } },
      select: { userId: true },
    });
    let deletingSuperAdminCount = 0;
    for (const u of users) {
      if (await this.isSuperAdmin(u.userId)) {
        deletingSuperAdminCount++;
        await this.checkSuperAdminHierarchy(u.userId, currentUserId, '删除');
      }
    }
    if (
      deletingSuperAdminCount > 0 &&
      (await this.countSuperAdminUsers()) - deletingSuperAdminCount < 2
    ) {
      throw new ForbiddenException('至少保留 2 个超级管理员');
    }
    await this.prisma.user.deleteMany({
      where: { userId: { in: ids } },
    });
  }
}
