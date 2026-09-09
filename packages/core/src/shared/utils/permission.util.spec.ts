import { extractPermissionCodes, extractRoleKeys, isSuperAdminOf } from './permission.util';

describe('extractPermissionCodes', () => {
  it('去重且跳过空/非字符串的 code', () => {
    const userRoles = [
      {
        role: {
          rolePermissions: [
            { permission: { code: 'a:list', type: 'BUTTON' } },
            { permission: { code: 'a:list', type: 'BUTTON' } },
            { permission: { code: null, type: 'BUTTON' } },
            { permission: { code: '', type: 'BUTTON' } },
          ],
        },
      },
      { role: null },
      null,
      undefined,
    ];
    expect(extractPermissionCodes(userRoles)).toEqual(['a:list']);
  });

  it('无过滤时保留所有类型的权限码', () => {
    const userRoles = [
      {
        role: {
          rolePermissions: [
            { permission: { code: 'api:x', type: 'API' } },
            { permission: { code: 'menu:y', type: 'MENU' } },
            { permission: { code: 'btn:z', type: 'BUTTON' } },
          ],
        },
      },
    ];
    expect(extractPermissionCodes(userRoles)).toEqual([
      'api:x',
      'menu:y',
      'btn:z',
    ]);
  });

  it('excludeTypes: [\x27API\x27] 时排除 API 类型但保留其他', () => {
    const userRoles = [
      {
        role: {
          rolePermissions: [
            { permission: { code: 'api:x', type: 'API' } },
            { permission: { code: 'menu:y', type: 'MENU' } },
            { permission: { code: 'btn:z', type: null } },
          ],
        },
      },
    ];
    expect(
      extractPermissionCodes(userRoles, { excludeTypes: ['API'] }),
    ).toEqual(['menu:y', 'btn:z']);
  });

  it('type 缺失/null 的权限在 excludeTypes 下仍保留', () => {
    const userRoles = [
      {
        role: {
          rolePermissions: [
            { permission: { code: 'no-type', type: undefined } },
            { permission: { code: 'null-type', type: null } },
          ],
        },
      },
    ];
    expect(
      extractPermissionCodes(userRoles, { excludeTypes: ['API'] }),
    ).toEqual(['no-type', 'null-type']);
  });

  it('空/缺省输入返回空数组', () => {
    expect(extractPermissionCodes(undefined)).toEqual([]);
    expect(extractPermissionCodes(null)).toEqual([]);
    expect(extractPermissionCodes([])).toEqual([]);
  });
});

describe('extractRoleKeys', () => {
  it('提取并去重角色码，跳过空值', () => {
    const userRoles = [
      { role: { roleKey: 'admin' } },
      { role: { roleKey: 'admin' } },
      { role: { roleKey: 'user' } },
      { role: { roleKey: '' } },
      { role: null },
      null,
    ];
    expect(extractRoleKeys(userRoles)).toEqual(['admin', 'user']);
  });

  it('空/缺省输入返回空数组', () => {
    expect(extractRoleKeys(undefined)).toEqual([]);
    expect(extractRoleKeys(null)).toEqual([]);
    expect(extractRoleKeys([])).toEqual([]);
  });
});

describe('isSuperAdminOf', () => {
  it('包含 super_admin 时返回 true', () => {
    expect(isSuperAdminOf(['admin', 'super_admin'])).toBe(true);
  });

  it('不含 super_admin 时返回 false', () => {
    expect(isSuperAdminOf(['admin', 'user'])).toBe(false);
  });

  it('空/缺省输入返回 false（fail-closed）', () => {
    expect(isSuperAdminOf(undefined)).toBe(false);
    expect(isSuperAdminOf(null)).toBe(false);
    expect(isSuperAdminOf([])).toBe(false);
  });
});
