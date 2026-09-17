import { BadRequestException, NotFoundException, HttpException } from '@nestjs/common';
import {
  resolveErrorPresentation,
  toHttpStatus,
} from './error-presentation';
import { ErrorShowType } from '../../shared/interfaces/response.interface';

describe('resolveErrorPresentation（异常 → 对外展示，纯函数）', () => {
  describe('HttpException 分支：业务契约逐字保留（决策 4 护栏）', () => {
    it('string 响应体：两种环境逐字一致', () => {
      const ex = new NotFoundException('INQUIRY_NOT_FOUND');
      for (const isProduction of [false, true]) {
        expect(resolveErrorPresentation(ex, { isProduction })).toEqual({
          status: 404,
          message: 'INQUIRY_NOT_FOUND',
          showType: ErrorShowType.WARN_MESSAGE,
        });
      }
    });

    it('object 响应体（业务错误码对象）：message 字段优先', () => {
      const ex = new HttpException(
        { message: 'INQUIRY_INVALID_STATUS_TRANSITION' },
        409,
      );
      for (const isProduction of [false, true]) {
        const r = resolveErrorPresentation(ex, { isProduction });
        expect(r.message).toBe('INQUIRY_INVALID_STATUS_TRANSITION');
        expect(r.status).toBe(409);
        expect(r.showType).toBe(ErrorShowType.ERROR_MESSAGE);
      }
    });

    it('数组 message（ValidationPipe）：聚合一处', () => {
      const ex = new BadRequestException(['a must be a string', 'b is too long']);
      const r = resolveErrorPresentation(ex, { isProduction: true });
      expect(r.message).toBe(
        '请求参数错误: a must be a string, b is too long',
      );
    });

    it('object 无 message/error：回退 exception.message（已知后续项，行为保持）', () => {
      const ex = new HttpException({ code: 'X' }, 400);
      const r = resolveErrorPresentation(ex, { isProduction: true });
      expect(r.message).toBe('Http Exception');
    });
  });

  describe('非 HttpException：环境收敛', () => {
    it('Error：生产环境 → 泛化文案（原始 message 只进日志）', () => {
      const r = resolveErrorPresentation(
        new Error('boom: select * from "inquiries" where "customerId" = ...'),
        { isProduction: true },
      );
      expect(r.status).toBe(500);
      expect(r.message).toBe('服务器内部错误');
      expect(r.showType).toBe(ErrorShowType.NOTIFICATION);
    });

    it('Error：非生产环境保留原始 message（调试体验）', () => {
      const r = resolveErrorPresentation(new Error('boom'), {
        isProduction: false,
      });
      expect(r.message).toBe('boom');
    });

    it('Error 且 message 为空串：两种环境都是泛化文案', () => {
      for (const isProduction of [false, true]) {
        const r = resolveErrorPresentation(new Error(''), { isProduction });
        expect(r.message).toBe('服务器内部错误');
      }
    });

    it('非 Error 抛出值：未知错误', () => {
      for (const isProduction of [false, true]) {
        const r = resolveErrorPresentation('a string thrown', { isProduction });
        expect(r.status).toBe(500);
        expect(r.message).toBe('未知错误');
      }
    });
  });

  describe('toHttpStatus（业务码 → HTTP）', () => {
    it('标准 HTTP 码直通', () => {
      expect(toHttpStatus(404)).toBe(404);
      expect(toHttpStatus(418)).toBe(418);
    });

    it('非标准码兜底 500', () => {
      expect(toHttpStatus(0)).toBe(500);
      expect(toHttpStatus(999)).toBe(500);
    });
  });
});
