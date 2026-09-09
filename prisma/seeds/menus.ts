import { PrismaClient } from '@prisma/client';

interface MenuNode {
  type: 'CATALOG' | 'MENU';
  name: string;
  code?: string; // 国际化键，如 system.management
  permissionCode?: string; // 绑定 API 权限码，如 system:user:list
  path: string;
  icon?: string;
  sort?: number;
  children?: MenuNode[];
}

export async function seedMenus(prisma: PrismaClient) {
  console.log('🔐 开始创建菜单数据...');

  const menuTree: MenuNode[] = [
    {
      type: 'CATALOG',
      name: '系统监控',
      code: 'menu.monitor',
      path: '/monitor',
      icon: 'MonitorOutlined',
      sort: 1,
      children: [
        {
          type: 'MENU',
          name: '服务监控',
          code: 'menu.monitor.server',
          permissionCode: 'monitor:server:list',
          path: '/monitor/server',
          icon: 'DashboardOutlined',
          sort: 1,
        },
        {
          type: 'MENU',
          name: '在线用户',
          code: 'menu.monitor.onlineUser',
          permissionCode: 'monitor:online-user:list',
          path: '/monitor/online-user',
          icon: 'TeamOutlined',
          sort: 2,
        },
        {
          type: 'MENU',
          name: '缓存监控',
          code: 'menu.monitor.cache',
          permissionCode: 'monitor:cache:list',
          path: '/monitor/cache',
          icon: 'DatabaseOutlined',
          sort: 3,
        },
      ],
    },
    {
      type: 'CATALOG',
      name: '系统管理',
      code: 'menu.system',
      path: '/system',
      icon: 'SettingOutlined',
      sort: 0,
      children: [
        {
          type: 'MENU',
          name: '用户管理',
          code: 'menu.system.user',
          permissionCode: 'system:user:list',
          path: '/system/user',
          icon: 'UserOutlined',
          sort: 1,
        },
        {
          type: 'MENU',
          name: '角色管理',
          code: 'menu.system.role',
          permissionCode: 'system:role:list',
          path: '/system/role',
          icon: 'TeamOutlined',
          sort: 2,
        },
        {
          type: 'MENU',
          name: '权限管理',
          code: 'menu.system.permission',
          permissionCode: 'system:permission:list',
          path: '/system/permission',
          icon: 'SafetyCertificateOutlined',
          sort: 3,
        },
        {
          type: 'MENU',
          name: '菜单管理',
          code: 'menu.system.menu',
          permissionCode: 'system:menu:list',
          path: '/system/menu',
          icon: 'MenuOutlined',
          sort: 4,
        },
        {
          type: 'MENU',
          name: '部门管理',
          code: 'menu.system.department',
          permissionCode: 'system:department:list',
          path: '/system/department',
          icon: 'ApartmentOutlined',
          sort: 5,
        },
        {
          type: 'MENU',
          name: '岗位管理',
          code: 'menu.system.position',
          permissionCode: 'system:position:list',
          path: '/system/position',
          icon: 'IdcardOutlined',
          sort: 6,
        },
        {
          type: 'MENU',
          name: '字典管理',
          code: 'menu.system.dictionary',
          permissionCode: 'system:dictionary:list',
          path: '/system/dictionary',
          icon: 'BookOutlined',
          sort: 7,
        },
        {
          type: 'MENU',
          name: '配置管理',
          code: 'menu.system.config',
          permissionCode: 'system:config:list',
          path: '/system/config',
          icon: 'ToolOutlined',
          sort: 8,
        },
        {
          type: 'MENU',
          name: '通知通告',
          code: 'menu.system.notice',
          permissionCode: 'system:notice:list',
          path: '/system/notice',
          icon: 'BellOutlined',
          sort: 9,
        },
        {
          type: 'CATALOG',
          name: '日志管理',
          code: 'menu.system.log',
          path: '/system/log',
          icon: 'FileTextOutlined',
          sort: 10,
          children: [
            {
              type: 'MENU',
              name: '登录日志',
              code: 'menu.system.log.login',
              permissionCode: 'system:log-login:list',
              path: '/system/log/login',
              icon: 'LoginOutlined',
              sort: 1,
            },
            {
              type: 'MENU',
              name: '操作日志',
              code: 'menu.system.log.operation',
              permissionCode: 'system:log-operation:list',
              path: '/system/log/operation',
              icon: 'AuditOutlined',
              sort: 2,
            },
          ],
        },
      ],
    },
    // ===== 业务域：设备/滤清器/询价/客户 =====
    {
      type: 'CATALOG',
      name: '设备管理',
      code: 'menu.equipment',
      path: '/equipment',
      icon: 'ToolOutlined',
      sort: 100,
      children: [
        {
          type: 'MENU',
          name: '设备品牌',
          code: 'menu.equipment.brand',
          permissionCode: 'equipment:brand:list',
          path: '/equipment/brands',
          icon: 'TagOutlined',
          sort: 1,
        },
        {
          type: 'MENU',
          name: '热门品牌',
          code: 'menu.equipment.hotBrand',
          permissionCode: 'equipment:hotBrand:view',
          path: '/equipment/hot-brands',
          icon: 'FireOutlined',
          sort: 1,
        },
        {
          type: 'MENU',
          name: '设备目录',
          code: 'menu.equipment.catalog',
          permissionCode: 'equipment:catalog:list',
          path: '/equipment/catalogs',
          icon: 'AppstoreOutlined',
          sort: 2,
        },
        {
          type: 'MENU',
          name: '滤清器类型',
          code: 'menu.equipment.filterType',
          permissionCode: 'equipment:filter-type:list',
          path: '/equipment/filter-types',
          icon: 'FilterOutlined',
          sort: 3,
        },
        {
          type: 'MENU',
          name: '滤清器',
          code: 'menu.equipment.filter',
          permissionCode: 'equipment:filter:list',
          path: '/equipment/filters',
          icon: 'CarOutlined',
          sort: 4,
        },
        {
          type: 'MENU',
          name: '设备档案',
          code: 'menu.equipment.equipment',
          permissionCode: 'equipment:equipment:list',
          path: '/equipment/equipment',
          icon: 'HddOutlined',
          sort: 5,
        },
      ],
    },
    {
      type: 'CATALOG',
      name: '询价管理',
      code: 'menu.inquiry',
      path: '/inquiry',
      icon: 'FileTextOutlined',
      sort: 200,
      children: [
        {
          type: 'MENU',
          name: '询价单',
          code: 'menu.inquiry.inquiry',
          permissionCode: 'inquiry:inquiry:list',
          path: '/inquiry/inquiries',
          icon: 'ProfileOutlined',
          sort: 1,
        },
        {
          type: 'MENU',
          name: '询价明细',
          code: 'menu.inquiry.inquiryLine',
          permissionCode: 'inquiry:inquiry-line:list',
          path: '/inquiry/inquiry-lines',
          icon: 'UnorderedListOutlined',
          sort: 2,
        },
      ],
    },
    {
      type: 'CATALOG',
      name: '客户管理',
      code: 'menu.customer',
      path: '/customer',
      icon: 'UserOutlined',
      sort: 300,
      children: [
        {
          type: 'MENU',
          name: '客户',
          code: 'menu.customer.customer',
          permissionCode: 'customer:customer:list',
          path: '/customer/customers',
          icon: 'TeamOutlined',
          sort: 1,
        },
        {
          type: 'MENU',
          name: '收货地址',
          code: 'menu.customer.address',
          permissionCode: 'customer:address:list',
          path: '/customer/addresses',
          icon: 'EnvironmentOutlined',
          sort: 2,
        },
        {
          type: 'MENU',
          name: '收藏',
          code: 'menu.customer.favorite',
          permissionCode: 'customer:favorite:list',
          path: '/customer/favorites',
          icon: 'StarOutlined',
          sort: 3,
        },
        {
          type: 'MENU',
          name: '浏览历史',
          code: 'menu.customer.history',
          permissionCode: 'customer:history:list',
          path: '/customer/history',
          icon: 'HistoryOutlined',
          sort: 4,
        },
      ],
    },
  ];

  async function createMenuNode(node: MenuNode, parentId?: string) {
    const menu = await prisma.menu.upsert({
      where: { path: node.path },
      update: {
        name: node.name,
        type: node.type,
        parentMenuId: parentId ?? null,
        permissionCode: node.permissionCode ?? null,
        code: node.code ?? null,
        path: node.path,
        icon: node.icon,
        hidden: false,
        sort: node.sort ?? 0,
      },
      create: {
        name: node.name,
        type: node.type,
        parentMenuId: parentId ?? null,
        permissionCode: node.permissionCode ?? null,
        code: node.code ?? null,
        path: node.path,
        icon: node.icon,
        hidden: false,
        sort: node.sort ?? 0,
      },
    });

    if (node.children) {
      for (const child of node.children) {
        await createMenuNode(child, menu.menuId);
      }
    }
  }

  for (const root of menuTree) {
    await createMenuNode(root);
  }

  console.log('✅ 菜单数据创建完成');
}
