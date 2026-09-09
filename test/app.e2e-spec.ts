import * as request from 'supertest';
import { createTestApp } from './harness';

describe('AppController (e2e)', () => {
  it('GET /health 返回健康状态', async () => {
    const { app } = await createTestApp();

    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body.data.status).toBe('ok');
    expect(response.body.data).toHaveProperty('timestamp');
    expect(response.body.data).toHaveProperty('uptime');
    expect(response.body.data).toHaveProperty('version');

    await app.close();
  });

  it('GET / 返回 404（根路由不存在，仅 /health 存在）', async () => {
    const { app } = await createTestApp();
    await request(app.getHttpServer()).get('/').expect(404);
    await app.close();
  });
});