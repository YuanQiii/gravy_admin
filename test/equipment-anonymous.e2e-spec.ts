import * as request from 'supertest';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { createMallTestApp, createAdminTestApp } from './harness';

/* ── Minimal HS256 JWT signer (avoids jsonwebtoken transitive dep) ─ */

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

/* ── Test data factories ─────────────────────────────────────────── */

const now = new Date();

function makeEnabledBrand() {
  return {
    brandId: 'brand-001',
    name: 'Caterpillar',
    slug: 'caterpillar',
    sortOrder: 0,
    status: 'enabled',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeDisabledBrand() {
  return {
    ...makeEnabledBrand(),
    brandId: 'brand-002',
    name: 'Disbaled Brand',
    status: 'disabled',
  };
}

function makeEnabledCatalog() {
  return {
    catalogId: 'cat-001',
    name: 'Excavators',
    code: 'EXCA',
    slug: 'excavators',
    sortOrder: 0,
    status: 'enabled',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeDisabledCatalog() {
  return {
    ...makeEnabledCatalog(),
    catalogId: 'cat-002',
    name: 'Disabled Catalog',
    status: 'disabled',
  };
}

function makeEnabledFilterType() {
  return {
    filterTypeId: 'ft-001',
    name: 'Hydraulic Filter',
    code: 'HYD',
    sortOrder: 0,
    status: 'enabled',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeDisabledFilterType() {
  return {
    ...makeEnabledFilterType(),
    filterTypeId: 'ft-002',
    name: 'Disabled Filter Type',
    status: 'disabled',
  };
}

function makeEnabledFilter() {
  return {
    filterId: 'flt-001',
    model: '320D',
    typeName: 'Hydraulic',
    gencode: 'GEN001',
    sortOrder: 0,
    status: 'enabled',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeDisabledFilter() {
  return {
    ...makeEnabledFilter(),
    filterId: 'flt-002',
    model: 'Disabled Model',
    status: 'disabled',
  };
}

function makeEnabledEquipment() {
  return {
    equipmentId: 'eq-001',
    brandId: 'brand-001',
    brandName: 'Caterpillar',
    model: '320D',
    engineBrand: 'Cat',
    engineType: 'C6.6',
    catalogId: 'cat-001',
    catalogName: 'Excavators',
    sortOrder: 0,
    status: 'enabled',
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    equipmentFilters: [],
  };
}

function makeDisabledEquipment() {
  return {
    ...makeEnabledEquipment(),
    equipmentId: 'eq-002',
    model: 'Disabled Equipment',
    status: 'disabled',
  };
}

/* ── Helpers ─────────────────────────────────────────────────────── */

const LIST_PARAMS = '?page=1&pageSize=10&sortBy=createdAt&sortOrder=desc';

interface ModelMocks {
  findMany: jest.Mock;
  count: jest.Mock;
  findUnique: jest.Mock;
}

function getModelMocks(prisma: any, modelKey: string): ModelMocks {
  // Access to lazily-create the model proxy + jest.fn()s
  return {
    findMany: prisma[modelKey].findMany,
    count: prisma[modelKey].count,
    findUnique: prisma[modelKey].findUnique,
  };
}

/**
 * Raw-SQL mock accessor — exposes the root-level $queryRaw mock plus the
 * filter/equipment/catalog model's findMany/count mocks so tests can drive
 * the anonymous weighted-sort path ($queryRaw) and assert call interactions.
 *
 * Mirrors the getModelMocks pattern but for $queryRaw + individual models,
 * avoiding repeated `prisma as unknown as {...}` casts at each test site.
 */
interface RawMocks {
  $queryRaw: jest.Mock;
  filter: {
    findMany: jest.Mock;
    count: jest.Mock;
  };
  equipment: {
    findMany: jest.Mock;
    count: jest.Mock;
  };
  catalog: {
    findMany: jest.Mock;
    count: jest.Mock;
  };
}

function getRawMocks(prisma: any): RawMocks {
  return {
    $queryRaw: prisma.$queryRaw,
    filter: {
      findMany: prisma.filter.findMany,
      count: prisma.filter.count,
    },
    equipment: {
      findMany: prisma.equipment.findMany,
      count: prisma.equipment.count,
    },
    catalog: {
      // Prisma model 名是 equipmentCatalog（见 schema EquipmentCatalog）
      findMany: prisma.equipmentCatalog.findMany,
      count: prisma.equipmentCatalog.count,
    },
  };
}

function signAdminToken(secret: string): string {
  return signJwt(
    {
      sub: 'admin-user-id',
      // 后台域 realm 声明：`JwtStrategy` 强制断言 realm === 'user'
      //（2026-09-09 enforce-backend-realm-assertion），缺失即 401
      realm: 'user',
      roleKeys: ['super_admin'],
      status: 'enabled',
      username: 'admin',
      nickname: 'Admin',
      email: 'admin@example.com',
      // passport-jwt checks exp if ignoreExpiration=false
      exp: Math.floor(Date.now() / 1000) + 300,
      iat: Math.floor(Date.now() / 1000),
    },
    secret,
  );
}

/* ── 5.1 – 5.4: Access and visibility tests ──────────────────────── */

describe('Equipment Anonymous Access (e2e)', () => {
  let mallHarness: Awaited<ReturnType<typeof createMallTestApp>>;
  let adminHarness: Awaited<ReturnType<typeof createAdminTestApp>>;
  let adminToken: string;
  let secret: string;

  beforeAll(async () => {
    mallHarness = await createMallTestApp();
    adminHarness = await createAdminTestApp();

    const configService = adminHarness.module.get(ConfigService);
    secret = configService.get<string>('jwt.secret') || 'default-secret-key';
    adminToken = signAdminToken(secret);
  });

  afterAll(async () => {
    await mallHarness.app.close();
    await adminHarness.app.close();
  });

  /* ── 5.1: Anonymous GET returns 200 with enabled records only ── */

  describe('5.1 Anonymous GET list endpoints', () => {
    // Note: 'filters' moved to 5.6, 'equipment' to 5.7, 'catalogs' to 5.8 —
    // those modules now use $queryRaw (weighted sort) for anonymous access,
    // so the shared `findMany was called` assertion no longer applies.
    // Only dictionary-ish tables (brands / filter-types) remain here.
    const cases: Array<[string, string, string, () => any]> = [
      ['brands', '/brands', 'equipmentBrand', makeEnabledBrand],
      [
        'filter-types',
        '/filter-types',
        'filterType',
        makeEnabledFilterType,
      ],
    ];

    beforeEach(() => {
      for (const [, , modelKey, factory] of cases) {
        const mocks = getModelMocks(mallHarness.prisma, modelKey);
        mocks.findMany.mockResolvedValue([factory()]);
        mocks.count.mockResolvedValue(1);
      }
    });

    it.each(cases)(
      'GET /b2c/%s returns 200, items all enabled, where.status=enabled',
      async (_label, path, modelKey) => {
        const res = await request(mallHarness.app.getHttpServer())
          .get(`${path}${LIST_PARAMS}`)
          .expect(200);

        expect(res.body.data.items).toHaveLength(1);
        expect(res.body.data.items[0].status).toBe('enabled');

        const mocks = getModelMocks(mallHarness.prisma, modelKey);
        expect(mocks.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ status: 'enabled' }),
          }),
        );
      },
    );
  });

  describe('5.1 Anonymous GET detail endpoints', () => {
    const cases: Array<[string, string, string, () => any]> = [
      [
        'brands',
        '/brands/brand-001',
        'equipmentBrand',
        makeEnabledBrand,
      ],
      [
        'catalogs',
        '/catalogs/cat-001',
        'equipmentCatalog',
        makeEnabledCatalog,
      ],
      [
        'filter-types',
        '/filter-types/ft-001',
        'filterType',
        makeEnabledFilterType,
      ],
      ['filters', '/filters/flt-001', 'filter', makeEnabledFilter],
      [
        'equipment',
        '/equipment/eq-001',
        'equipment',
        makeEnabledEquipment,
      ],
    ];

    beforeEach(() => {
      for (const [, , modelKey, factory] of cases) {
        const mocks = getModelMocks(mallHarness.prisma, modelKey);
        mocks.findUnique.mockResolvedValue(factory());
      }
    });

    it.each(cases)(
      'GET /b2c/%s/:id returns 200 with enabled record',
      async (_label, path, _modelKey) => {
        const res = await request(mallHarness.app.getHttpServer())
          .get(path)
          .expect(200);

        expect(res.body.data.status).toBe('enabled');
      },
    );
  });

  describe('5.1 Anonymous GET /equipment/filter-types/options', () => {
    beforeEach(() => {
      const mocks = getModelMocks(mallHarness.prisma, 'filterType');
      mocks.findMany.mockResolvedValue([
        {
          filterTypeId: 'ft-001',
          name: 'Hydraulic Filter',
          code: 'HYD',
          sortOrder: 0,
        },
      ]);
    });

    it('returns 200 with enabled options', async () => {
      const res = await request(mallHarness.app.getHttpServer())
        .get('/filter-types/options')
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data).toHaveLength(1);
    });
  });

  /* ── 5.2: Anonymous GET disabled/deleted record returns 404 ──── */

  describe('5.2 Anonymous GET disabled record returns 404', () => {
    const cases: Array<[string, string, string, () => any]> = [
      [
        'brands',
        '/brands/brand-002',
        'equipmentBrand',
        makeDisabledBrand,
      ],
      [
        'catalogs',
        '/catalogs/cat-002',
        'equipmentCatalog',
        makeDisabledCatalog,
      ],
      [
        'filter-types',
        '/filter-types/ft-002',
        'filterType',
        makeDisabledFilterType,
      ],
      ['filters', '/filters/flt-002', 'filter', makeDisabledFilter],
      [
        'equipment',
        '/equipment/eq-002',
        'equipment',
        makeDisabledEquipment,
      ],
    ];

    beforeEach(() => {
      for (const [, , modelKey, factory] of cases) {
        const mocks = getModelMocks(mallHarness.prisma, modelKey);
        mocks.findUnique.mockResolvedValue(factory());
      }
    });

    it.each(cases)(
      'GET /b2c/%s/:id (disabled) returns 404',
      async (_label, path) => {
        await request(mallHarness.app.getHttpServer()).get(path).expect(404);
      },
    );
  });

  /* ── 5.3: Anonymous POST returns 401 ──────────────────────────── */

  describe('5.3 Anonymous POST returns 401', () => {
    it('POST /equipment/filters without Authorization returns 401', async () => {
      await request(adminHarness.app.getHttpServer())
        .post('/equipment/filters')
        .send({ model: 'X', typeName: 'Y' })
        .expect(401);
    });
  });

  /* ── 5.4: Authenticated GET can see disabled records ─────────── */

  describe('5.4 Authenticated GET can see disabled records', () => {
    beforeEach(() => {
      const mocks = getModelMocks(adminHarness.prisma, 'equipmentBrand');
      mocks.findMany.mockResolvedValue([makeDisabledBrand()]);
      mocks.count.mockResolvedValue(1);
    });

    it('GET /equipment/brands?status=disabled with admin JWT returns 200 with disabled items', async () => {
      const res = await request(adminHarness.app.getHttpServer())
        .get(`/equipment/brands${LIST_PARAMS}&status=disabled`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].status).toBe('disabled');

      // Authenticated path must NOT force where.status='enabled'
      const mocks = getModelMocks(adminHarness.prisma, 'equipmentBrand');
      expect(mocks.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'disabled' }),
        }),
      );
    });
  });

  /* ── 5.6: Anonymous filter weighted sort ───────────────────────── */

  describe('5.6 Anonymous filter weighted sort', () => {
    // A: full core display fields (gencode/photo/drawing) → score 15
    const weightedA = {
      ...makeEnabledFilter(),
      filterId: 'flt-A',
      gencode: 'GEN-A',
      photoUuid: 'photo-A',
      drawingUuid: 'draw-A',
    };
    // B: only key params (weight/volume) → score 6
    const weightedB = {
      ...makeEnabledFilter(),
      filterId: 'flt-B',
      // Override base factory's gencode='GEN001' so B's score actually = 6
      gencode: null,
      weight: 1,
      volume: 1,
    };
    // C: no fields populated → score 0
    const weightedC = {
      ...makeEnabledFilter(),
      filterId: 'flt-C',
      // Override base factory's gencode='GEN001' so C's score actually = 0
      gencode: null,
    };

    beforeEach(() => {
      // mall prisma 服务于匿名 /b2c/filters，admin prisma 服务于已验证 /equipment/filters
      for (const harness of [mallHarness, adminHarness]) {
        const mocks = getRawMocks(harness.prisma);
        // Clear call history from previous tests so `not.toHaveBeenCalled()`
        // assertions reflect only the current test's behavior.
        mocks.$queryRaw.mockClear();
        mocks.filter.findMany.mockClear();
        mocks.filter.count.mockClear();
        // Pre-sorted rows returned by $queryRaw (mock simulates DB ordering).
        mocks.$queryRaw.mockResolvedValue([weightedA, weightedB, weightedC]);
        mocks.filter.count.mockResolvedValue(3);
        // Reset findMany to default empty so we can assert it is NOT called
        // for the anonymous path.
        mocks.filter.findMany.mockResolvedValue([]);
      }
    });

    it('anonymous GET /b2c/filters returns items in $queryRaw weighted order', async () => {
      const mocks = getRawMocks(mallHarness.prisma);
      const res = await request(mallHarness.app.getHttpServer())
        .get('/filters?page=1&pageSize=10')
        .expect(200);

      expect(res.body.data.items).toHaveLength(3);
      expect(res.body.data.items[0].filterId).toBe('flt-A');
      expect(res.body.data.items[1].filterId).toBe('flt-B');
      expect(res.body.data.items[2].filterId).toBe('flt-C');
      // Spec testing case 1: every returned item must be status='enabled'
      // (anonymous visibility filter must apply, not just to count).
      for (const item of res.body.data.items) {
        expect(item.status).toBe('enabled');
      }

      // Anonymous path must use $queryRaw, NOT findMany
      expect(mocks.$queryRaw).toHaveBeenCalled();
      expect(mocks.filter.findMany).not.toHaveBeenCalled();
    });

    it('anonymous GET /b2c/filters ignores ?sortBy param (weighted sort wins)', async () => {
      const mocks = getRawMocks(mallHarness.prisma);
      const res = await request(mallHarness.app.getHttpServer())
        .get(
          '/filters?page=1&pageSize=10&sortBy=model&sortOrder=desc',
        )
        .expect(200);

      // Same weighted order as previous test — sortBy ignored for anonymous
      expect(res.body.data.items[0].filterId).toBe('flt-A');
      expect(res.body.data.items[2].filterId).toBe('flt-C');

      expect(mocks.$queryRaw).toHaveBeenCalled();
      expect(mocks.filter.findMany).not.toHaveBeenCalled();
    });

    it('anonymous GET /b2c/filters passes status=enabled to count query', async () => {
      const mocks = getRawMocks(mallHarness.prisma);
      await request(mallHarness.app.getHttpServer())
        .get('/filters?page=1&pageSize=10')
        .expect(200);

      // count is shared between paths; visibility filter must still apply
      expect(mocks.filter.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'enabled' }),
        }),
      );
    });

    it('authenticated GET /equipment/filters uses findMany, not $queryRaw', async () => {
      const mocks = getRawMocks(adminHarness.prisma);
      mocks.filter.findMany.mockResolvedValue([weightedA]);
      mocks.filter.count.mockResolvedValue(1);

      const res = await request(adminHarness.app.getHttpServer())
        .get('/equipment/filters?page=1&pageSize=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].filterId).toBe('flt-A');

      // Authenticated path must use findMany, NOT $queryRaw
      expect(mocks.filter.findMany).toHaveBeenCalled();
      expect(mocks.$queryRaw).not.toHaveBeenCalled();
    });

    it('anonymous GET /b2c/filters preserves $queryRaw order for tiebreaker (createdAt DESC)', async () => {
      // Spec testing case 4: two records with same weighted score (0) and
      // same sortOrder (0) but different createdAt — DB returns newer first
      // (createdAt DESC third-level sort). Mock simulates that pre-sorted
      // result; we assert the service passes rows through untouched.
      const older = {
        ...makeEnabledFilter(),
        filterId: 'flt-old',
        gencode: null,
        createdAt: new Date('2024-01-01T00:00:00Z'),
      };
      const newer = {
        ...makeEnabledFilter(),
        filterId: 'flt-new',
        gencode: null,
        createdAt: new Date('2026-08-01T00:00:00Z'),
      };
      const mocks = getRawMocks(mallHarness.prisma);
      // DB applies createdAt DESC → newer row first
      mocks.$queryRaw.mockResolvedValue([newer, older]);
      mocks.filter.count.mockResolvedValue(2);

      const res = await request(mallHarness.app.getHttpServer())
        .get('/filters?page=1&pageSize=10')
        .expect(200);

      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items[0].filterId).toBe('flt-new');
      expect(res.body.data.items[1].filterId).toBe('flt-old');
    });
  });

  /* ── 5.7: Anonymous equipment weighted sort ──────────────────────── */

  describe('5.7 Anonymous equipment weighted sort', () => {
    // 加权字段划分（见 specs v2 §Implementation → Equipment weighted sort）：
    //   核心 w=5: engineBrand / engineType / power / engineEnergy  (4 fields)
    //   关键 w=3: productionDateStart / productionDateEnd           (2 fields)
    //   完整 w=1: brandId / catalogId                               (2 fields)
    //
    // A: 全量 8 个字段 → 总分 4*5 + 2*3 + 2*1 = 28
    const eqA = {
      ...makeEnabledEquipment(),
      equipmentId: 'eq-A',
      model: 'A-Engine-Full',
      engineBrand: 'Cat',
      engineType: 'C6.6',
      power: 100,
      engineEnergy: 'diesel',
      productionDateStart: new Date('2020-01-01T00:00:00Z'),
      productionDateEnd: new Date('2024-12-31T00:00:00Z'),
      brandId: 'brand-001',
      catalogId: 'cat-001',
    };
    // B: 仅关键参数（w=3 全） → 总分 6
    const eqB = {
      ...makeEnabledEquipment(),
      equipmentId: 'eq-B',
      model: 'B-Production-Only',
      // 置空非关键字段，保证 score 只来自关键参数
      engineBrand: null,
      engineType: null,
      power: null,
      engineEnergy: null,
      productionDateStart: new Date('2021-01-01T00:00:00Z'),
      productionDateEnd: new Date('2023-12-31T00:00:00Z'),
      brandId: null,
      catalogId: null,
    };
    // C: 字段全空 → 总分 0
    const eqC = {
      ...makeEnabledEquipment(),
      equipmentId: 'eq-C',
      model: 'C-Empty-Fields',
      engineBrand: null,
      engineType: null,
      power: null,
      engineEnergy: null,
      productionDateStart: null,
      productionDateEnd: null,
      brandId: null,
      catalogId: null,
    };

    beforeEach(() => {
      const mocks = getRawMocks(mallHarness.prisma);
      mocks.$queryRaw.mockClear();
      mocks.equipment.findMany.mockClear();
      mocks.equipment.count.mockClear();
      mocks.$queryRaw.mockResolvedValue([eqA, eqB, eqC]);
      mocks.equipment.count.mockResolvedValue(3);
      mocks.equipment.findMany.mockResolvedValue([]);
    });

    it('anonymous GET /b2c/equipment returns items in $queryRaw weighted order', async () => {
      const mocks = getRawMocks(mallHarness.prisma);
      const res = await request(mallHarness.app.getHttpServer())
        .get('/equipment?page=1&pageSize=10')
        .expect(200);

      expect(res.body.data.items).toHaveLength(3);
      expect(res.body.data.items[0].equipmentId).toBe('eq-A');
      expect(res.body.data.items[1].equipmentId).toBe('eq-B');
      expect(res.body.data.items[2].equipmentId).toBe('eq-C');
      for (const item of res.body.data.items) {
        expect(item.status).toBe('enabled');
      }
      // DTO 过滤：不能暴露自增 id
      for (const item of res.body.data.items) {
        expect(item.id).toBeUndefined();
      }
      expect(res.body.data.total).toBe(3);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.pageSize).toBe(10);

      expect(mocks.$queryRaw).toHaveBeenCalled();
      expect(mocks.equipment.findMany).not.toHaveBeenCalled();
    });

    it('anonymous GET /b2c/equipment ignores ?sortBy param (weighted sort wins)', async () => {
      const mocks = getRawMocks(mallHarness.prisma);
      const res = await request(mallHarness.app.getHttpServer())
        .get(
          '/equipment?page=1&pageSize=10&sortBy=model&sortOrder=desc',
        )
        .expect(200);

      expect(res.body.data.items[0].equipmentId).toBe('eq-A');
      expect(res.body.data.items[2].equipmentId).toBe('eq-C');

      expect(mocks.$queryRaw).toHaveBeenCalled();
      expect(mocks.equipment.findMany).not.toHaveBeenCalled();
    });

    it('anonymous GET /b2c/equipment passes status=enabled to count query', async () => {
      const mocks = getRawMocks(mallHarness.prisma);
      await request(mallHarness.app.getHttpServer())
        .get('/equipment?page=1&pageSize=10')
        .expect(200);

      expect(mocks.equipment.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'enabled' }),
        }),
      );
    });
  });

  /* ── 5.8: Anonymous catalogs weighted sort ───────────────────────── */

  describe('5.8 Anonymous catalogs weighted sort', () => {
    // 加权字段（EquipmentCatalog 业务 nullable 共 2 个）：
    //   核心 w=5: code            (产品系列号，客户搜索匹配用)
    //   关键 w=3: description     (产品说明)
    //
    // A: 字段全齐 → 8
    const catA = {
      ...makeEnabledCatalog(),
      catalogId: 'cat-A',
      code: 'CODE-A',
      description: 'Full hydraulic excavator range',
    };
    // B: 仅 description → 3
    const catB = {
      ...makeEnabledCatalog(),
      catalogId: 'cat-B',
      code: null,
      description: 'Some description only',
    };
    // C: 字段全空 → 0
    const catC = {
      ...makeEnabledCatalog(),
      catalogId: 'cat-C',
      code: null,
      description: null,
    };

    beforeEach(() => {
      const mocks = getRawMocks(mallHarness.prisma);
      mocks.$queryRaw.mockClear();
      mocks.catalog.findMany.mockClear();
      mocks.catalog.count.mockClear();
      mocks.$queryRaw.mockResolvedValue([catA, catB, catC]);
      mocks.catalog.count.mockResolvedValue(3);
      mocks.catalog.findMany.mockResolvedValue([]);
    });

    it('anonymous GET /b2c/catalogs returns items in $queryRaw weighted order', async () => {
      const mocks = getRawMocks(mallHarness.prisma);
      const res = await request(mallHarness.app.getHttpServer())
        .get('/catalogs?page=1&pageSize=10')
        .expect(200);

      expect(res.body.data.items).toHaveLength(3);
      expect(res.body.data.items[0].catalogId).toBe('cat-A');
      expect(res.body.data.items[1].catalogId).toBe('cat-B');
      expect(res.body.data.items[2].catalogId).toBe('cat-C');
      for (const item of res.body.data.items) {
        expect(item.status).toBe('enabled');
      }
      // DTO 过滤：不能暴露自增 id
      for (const item of res.body.data.items) {
        expect(item.id).toBeUndefined();
      }
      expect(res.body.data.total).toBe(3);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.pageSize).toBe(10);

      expect(mocks.$queryRaw).toHaveBeenCalled();
      expect(mocks.catalog.findMany).not.toHaveBeenCalled();
    });

    it('anonymous GET /b2c/catalogs ignores ?sortBy param (weighted sort wins)', async () => {
      const mocks = getRawMocks(mallHarness.prisma);
      const res = await request(mallHarness.app.getHttpServer())
        .get(
          '/catalogs?page=1&pageSize=10&sortBy=name&sortOrder=desc',
        )
        .expect(200);

      expect(res.body.data.items[0].catalogId).toBe('cat-A');
      expect(res.body.data.items[2].catalogId).toBe('cat-C');

      expect(mocks.$queryRaw).toHaveBeenCalled();
      expect(mocks.catalog.findMany).not.toHaveBeenCalled();
    });

    it('anonymous GET /b2c/catalogs passes status=enabled to count query', async () => {
      const mocks = getRawMocks(mallHarness.prisma);
      await request(mallHarness.app.getHttpServer())
        .get('/catalogs?page=1&pageSize=10')
        .expect(200);

      expect(mocks.catalog.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'enabled' }),
        }),
      );
    });
  });

  /* ── 5.9: Equipment list model / brandName exact filter ─────────── */

  describe('5.9 Equipment list model & brandName exact filter', () => {
    beforeEach(() => {
      for (const harness of [mallHarness, adminHarness]) {
        const mocks = getRawMocks(harness.prisma);
        mocks.$queryRaw.mockClear();
        mocks.equipment.findMany.mockClear();
        mocks.equipment.count.mockClear();
        mocks.$queryRaw.mockResolvedValue([makeEnabledEquipment()]);
        mocks.equipment.count.mockResolvedValue(1);
        mocks.equipment.findMany.mockResolvedValue([makeEnabledEquipment()]);
      }
    });

    it('anonymous GET /b2c/equipment?model=X200 puts model ILIKE into $queryRaw and equals+insensitive into count', async () => {
      const mocks = getRawMocks(mallHarness.prisma);
      await request(mallHarness.app.getHttpServer())
        .get('/equipment?page=1&pageSize=10&model=X200')
        .expect(200);

      // B2C raw SQL 路径：model 精确匹配（大小写不敏感）必须进入 $queryRaw 条件
      const sqlArg = mocks.$queryRaw.mock.calls[0][0];
      expect(sqlArg.strings.join(' ')).toContain('"model" ILIKE');
      // count 与列表同源，携带同一 where
      expect(mocks.equipment.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            model: { equals: 'X200', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('anonymous GET /b2c/equipment?brandName=Bosch puts brandName ILIKE into $queryRaw', async () => {
      const mocks = getRawMocks(mallHarness.prisma);
      await request(mallHarness.app.getHttpServer())
        .get('/equipment?page=1&pageSize=10&brandName=Bosch')
        .expect(200);

      const sqlArg = mocks.$queryRaw.mock.calls[0][0];
      expect(sqlArg.strings.join(' ')).toContain('"brandName" ILIKE');
      expect(mocks.equipment.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            brandName: { equals: 'Bosch', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('authenticated GET /equipment?model=X200&brandName=Bosch uses findMany with equals+insensitive filters', async () => {
      const mocks = getRawMocks(adminHarness.prisma);
      const res = await request(adminHarness.app.getHttpServer())
        .get(
          '/equipment/equipment?page=1&pageSize=10&model=X200&brandName=Bosch',
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // 管理域走 Prisma findMany，不使用 $queryRaw
      expect(mocks.equipment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            model: { equals: 'X200', mode: 'insensitive' },
            brandName: { equals: 'Bosch', mode: 'insensitive' },
          }),
        }),
      );
      expect(res.body.data.items).toHaveLength(1);
      expect(mocks.$queryRaw).not.toHaveBeenCalled();
    });
  });

  /* ── 5.10 认证域互斥（D5）：customer token 打 admin 路由 401 ── */

  describe('5.10 auth-realm mutual exclusion', () => {
    it('customer token（即便伪造 roleKeys）打 admin 路由 401', async () => {
      // 带 roleKeys+status 的 customer token：旧"恰好缺 roleKeys"的巧合防线
      // 已失效（本 token 不缺），只有 admin realm 显式断言能挡下 → 401
      const customerToken = signJwt(
        {
          sub: 'cust-uuid-1',
          realm: 'customer',
          roleKeys: ['super_admin'],
          status: 'enabled',
          username: 'cust',
          nickname: 'Cust',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 300,
        },
        secret,
      );
      await request(adminHarness.app.getHttpServer())
        .get('/equipment/equipment?page=1&pageSize=10')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(401);
    });
  });
});

/* ── 5.5: Rate limiting ──────────────────────────────────────────── */

describe('Equipment Anonymous Rate Limiting (e2e)', () => {
  let mallHarness: Awaited<ReturnType<typeof createMallTestApp>>;

  beforeAll(async () => {
    mallHarness = await createMallTestApp();
    const mocks = getModelMocks(mallHarness.prisma, 'equipmentBrand');
    mocks.findMany.mockResolvedValue([makeEnabledBrand()]);
    mocks.count.mockResolvedValue(1);
  });

  afterAll(async () => {
    await mallHarness.app.close();
  });

  it('returns 429 on the 61st request from the same IP', async () => {
    const server = mallHarness.app.getHttpServer();

    // First 60 requests should succeed (limit = 60/min)
    for (let i = 0; i < 60; i++) {
      await request(server).get(`/brands${LIST_PARAMS}`).expect(200);
    }

    // 61st request should be rate-limited
    const res = await request(server)
      .get(`/brands${LIST_PARAMS}`)
      .expect(429);

    expect(res.headers['retry-after']).toBeDefined();
  });
});