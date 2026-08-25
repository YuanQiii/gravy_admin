import * as request from 'supertest';
import { createTestApp } from './harness';

describe('AppController (e2e)', () => {
  it('GET / 返回 Hello World!', async () => {
    const { app } = await createTestApp();

    const response = await request(app.getHttpServer()).get('/').expect(200);

    expect(response.text).toBe('Hello World!');

    await app.close();
  });
});
