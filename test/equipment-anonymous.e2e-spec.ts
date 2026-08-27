import * as request from 'supertest';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { createTestApp } from './harness';

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
 * filter model's findMany/count mocks so tests can drive the anonymous
 * weighted-sort path ($queryRaw) and assert call interactions.
 *
 * Mirrors the getModelMocks pattern but for $queryRaw + a single model,
 * avoiding repeated `prisma as unknown as {...}` casts at each test site.
 */
interface RawMocks {
  $queryRaw: jest.Mock;
  filter: {
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
  };
}

function signAdminToken(secret: string): string {
  return signJwt(
    {
      sub: 'admin-user-id',
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
  let harness: Awaited<ReturnType<typeof createTestApp>>;
  let adminToken: string;

  beforeAll(async () => {
    harness = await createTestApp();

    const configService = harness.module.get(ConfigService);
    const secret =
      configService.get<string>('jwt.secret') || 'default-secret-key';
    adminToken = signAdminToken(secret);
  });

  afterAll(async () => {
    await harness.app.close();
  });

  /* ── 5.1: Anonymous GET returns 200 with enabled records only ── */

  describe('5.1 Anonymous GET list endpoints', () => {
    // Note: 'filters' list endpoint moved to 5.6 — anonymous path now uses
    // $queryRaw (weighted sort) instead of findMany, so the shared
    // `findMany was called` assertion no longer applies.
    const cases: Array<[string, string, string, () => any]> = [
      ['brands', '/equipment/brands', 'equipmentBrand', makeEnabledBrand],
      ['catalogs', '/equipment/catalogs', 'equipmentCatalog', makeEnabledCatalog],
      ['filter-types', '/equipment/filter-types', 'filterType', makeEnabledFilterType],
      ['equipment', '/equipment/equipment', 'equipment', makeEnabledEquipment],
    ];

    beforeEach(() => {
      for (const [, , modelKey, factory] of cases) {
        const mocks = getModelMocks(harness.prisma, modelKey);
        mocks.findMany.mockResolvedValue([factory()]);
        mocks.count.mockResolvedValue(1);
      }
    });

    it.each(cases)(
      'GET /equipment/%s returns 200, items all enabled, where.status=enabled',
      async (_label, path, modelKey) => {
        const res = await request(harness.app.getHttpServer())
          .get(`${path}${LIST_PARAMS}`)
          .expect(200);

        expect(res.body.data.items).toHaveLength(1);
        expect(res.body.data.items[0].status).toBe('enabled');

        const mocks = getModelMocks(harness.prisma, modelKey);
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
      ['brands', '/equipment/brands/brand-001', 'equipmentBrand', makeEnabledBrand],
      ['catalogs', '/equipment/catalogs/cat-001', 'equipmentCatalog', makeEnabledCatalog],
      ['filter-types', '/equipment/filter-types/ft-001', 'filterType', makeEnabledFilterType],
      ['filters', '/equipment/filters/flt-001', 'filter', makeEnabledFilter],
      ['equipment', '/equipment/equipment/eq-001', 'equipment', makeEnabledEquipment],
    ];

    beforeEach(() => {
      for (const [, , modelKey, factory] of cases) {
        const mocks = getModelMocks(harness.prisma, modelKey);
        mocks.findUnique.mockResolvedValue(factory());
      }
    });

    it.each(cases)(
      'GET /equipment/%s/:id returns 200 with enabled record',
      async (_label, path, _modelKey) => {
        const res = await request(harness.app.getHttpServer())
          .get(path)
          .expect(200);

        expect(res.body.data.status).toBe('enabled');
      },
    );
  });

  describe('5.1 Anonymous GET /equipment/filter-types/options', () => {
    beforeEach(() => {
      const mocks = getModelMocks(harness.prisma, 'filterType');
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
      const res = await request(harness.app.getHttpServer())
        .get('/equipment/filter-types/options')
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data).toHaveLength(1);
    });
  });

  /* ── 5.2: Anonymous GET disabled/deleted record returns 404 ──── */

  describe('5.2 Anonymous GET disabled record returns 404', () => {
    const cases: Array<[string, string, string, () => any]> = [
      ['brands', '/equipment/brands/brand-002', 'equipmentBrand', makeDisabledBrand],
      ['catalogs', '/equipment/catalogs/cat-002', 'equipmentCatalog', makeDisabledCatalog],
      ['filter-types', '/equipment/filter-types/ft-002', 'filterType', makeDisabledFilterType],
      ['filters', '/equipment/filters/flt-002', 'filter', makeDisabledFilter],
      ['equipment', '/equipment/equipment/eq-002', 'equipment', makeDisabledEquipment],
    ];

    beforeEach(() => {
      for (const [, , modelKey, factory] of cases) {
        const mocks = getModelMocks(harness.prisma, modelKey);
        mocks.findUnique.mockResolvedValue(factory());
      }
    });

    it.each(cases)(
      'GET /equipment/%s/:id (disabled) returns 404',
      async (_label, path) => {
        await request(harness.app.getHttpServer())
          .get(path)
          .expect(404);
      },
    );
  });

  /* ── 5.3: Anonymous POST returns 401 ──────────────────────────── */

  describe('5.3 Anonymous POST returns 401', () => {
    it('POST /equipment/filters without Authorization returns 401', async () => {
      await request(harness.app.getHttpServer())
        .post('/equipment/filters')
        .send({ model: 'X', typeName: 'Y' })
        .expect(401);
    });
  });

  /* ── 5.4: Authenticated GET can see disabled records ─────────── */

  describe('5.4 Authenticated GET can see disabled records', () => {
    beforeEach(() => {
      const mocks = getModelMocks(harness.prisma, 'equipmentBrand');
      mocks.findMany.mockResolvedValue([makeDisabledBrand()]);
      mocks.count.mockResolvedValue(1);
    });

    it('GET /equipment/brands?status=disabled with admin JWT returns 200 with disabled items', async () => {
      const res = await request(harness.app.getHttpServer())
        .get(`/equipment/brands${LIST_PARAMS}&status=disabled`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].status).toBe('disabled');

      // Authenticated path must NOT force where.status='enabled'
      const mocks = getModelMocks(harness.prisma, 'equipmentBrand');
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
    });

    it('anonymous GET /equipment/filters returns items in $queryRaw weighted order', async () => {
      const mocks = getRawMocks(harness.prisma);
      const res = await request(harness.app.getHttpServer())
        .get('/equipment/filters?page=1&pageSize=10')
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

    it('anonymous GET /equipment/filters ignores ?sortBy param (weighted sort wins)', async () => {
      const mocks = getRawMocks(harness.prisma);
      const res = await request(harness.app.getHttpServer())
        .get('/equipment/filters?page=1&pageSize=10&sortBy=model&sortOrder=desc')
        .expect(200);

      // Same weighted order as previous test — sortBy ignored for anonymous
      expect(res.body.data.items[0].filterId).toBe('flt-A');
      expect(res.body.data.items[2].filterId).toBe('flt-C');

      expect(mocks.$queryRaw).toHaveBeenCalled();
      expect(mocks.filter.findMany).not.toHaveBeenCalled();
    });

    it('anonymous GET /equipment/filters passes status=enabled to count query', async () => {
      const mocks = getRawMocks(harness.prisma);
      await request(harness.app.getHttpServer())
        .get('/equipment/filters?page=1&pageSize=10')
        .expect(200);

      // count is shared between paths; visibility filter must still apply
      expect(mocks.filter.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'enabled' }),
        }),
      );
    });

    it('authenticated GET /equipment/filters uses findMany, not $queryRaw', async () => {
      const mocks = getRawMocks(harness.prisma);
      mocks.filter.findMany.mockResolvedValue([weightedA]);
      mocks.filter.count.mockResolvedValue(1);

      const res = await request(harness.app.getHttpServer())
        .get('/equipment/filters?page=1&pageSize=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].filterId).toBe('flt-A');

      // Authenticated path must use findMany, NOT $queryRaw
      expect(mocks.filter.findMany).toHaveBeenCalled();
      expect(mocks.$queryRaw).not.toHaveBeenCalled();
    });

    it('anonymous GET /equipment/filters preserves $queryRaw order for tiebreaker (createdAt DESC)', async () => {
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
      const mocks = getRawMocks(harness.prisma);
      // DB applies createdAt DESC → newer row first
      mocks.$queryRaw.mockResolvedValue([newer, older]);
      mocks.filter.count.mockResolvedValue(2);

      const res = await request(harness.app.getHttpServer())
        .get('/equipment/filters?page=1&pageSize=10')
        .expect(200);

      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items[0].filterId).toBe('flt-new');
      expect(res.body.data.items[1].filterId).toBe('flt-old');
    });
  });
});

/* ── 5.5: Rate limiting ──────────────────────────────────────────── */

describe('Equipment Anonymous Rate Limiting (e2e)', () => {
  let harness: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    harness = await createTestApp();
    const mocks = getModelMocks(harness.prisma, 'equipmentBrand');
    mocks.findMany.mockResolvedValue([makeEnabledBrand()]);
    mocks.count.mockResolvedValue(1);
  });

  afterAll(async () => {
    await harness.app.close();
  });

  it('returns 429 on the 61st request from the same IP', async () => {
    const server = harness.app.getHttpServer();

    // First 60 requests should succeed (limit = 60/min)
    for (let i = 0; i < 60; i++) {
      await request(server)
        .get(`/equipment/brands${LIST_PARAMS}`)
        .expect(200);
    }

    // 61st request should be rate-limited
    const res = await request(server)
      .get(`/equipment/brands${LIST_PARAMS}`)
      .expect(429);

    expect(res.headers['retry-after']).toBeDefined();
  });
});
