import { HistorySideEffectService } from './history-side-effect.service';
import { FilterDetailFlow } from '@/modules/mall/browse/filter-detail.flow';
import { FilterResponseDto } from '@gvray/domain';

/**
 * 浏览历史副作用单测（take-history-write-off-request-path 2.1/2.2/3.1）：
 * 失败可见性 + off-path 契约（响应不等待写）。
 */
describe('HistorySideEffectService（fire-and-forget + 失败可见性）', () => {
  function build(recordView: jest.Mock) {
    const activityService = { recordView } as unknown as never;
    const service = new HistorySideEffectService(activityService);
    const warn = jest.spyOn(
      (service as unknown as { logger: { warn: jest.Mock } }).logger,
      'warn',
    );
    return { service, warn };
  }

  it('recordView reject：warn 携带 record_view_failed / requestId / err.stack（2.1）', async () => {
    const boom = new Error('db down');
    const { service, warn } = build(jest.fn().mockRejectedValue(boom));

    service.record('cust-A', 'flt-1', 'corr-001');

    // 等待微任务队列排空（catch 分支执行完）
    await new Promise((r) => setImmediate(r));

    expect(warn).toHaveBeenCalledTimes(1);
    const [message, stack] = warn.mock.calls[0] as [string, string];
    expect(message).toContain('record_view_failed');
    expect(message).toContain('flt-1');
    expect(message).toContain('cust-A');
    expect(message).toContain('corr-001');
    expect(stack).toBe(boom.stack);
  });

  it('recordView 成功：不产生任何日志', async () => {
    const { service, warn } = build(jest.fn().mockResolvedValue(undefined));
    service.record('cust-A', 'flt-1', 'corr-002');
    await new Promise((r) => setImmediate(r));
    expect(warn).not.toHaveBeenCalled();
  });

  it('recordView reject 时进程无 unhandledRejection（2.2：.catch 强制）', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    const { service } = build(jest.fn().mockRejectedValue(new Error('x')));
    service.record('cust-A', 'flt-1');
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('record 无返回值（fire-and-forget 契约：调用方无可等待物）', () => {
    const { service } = build(jest.fn().mockResolvedValue(undefined));
    expect(service.record('cust-A', 'flt-1')).toBeUndefined();
  });
});

describe('FilterDetailFlow（off-path 契约 3.1：响应不等待写）', () => {
  function buildFlow(record: jest.Mock) {
    const data = { filterId: 'flt-1', model: 'M1' } as unknown as FilterResponseDto;
    const filtersService = {
      findOne: jest.fn().mockResolvedValue(data),
    } as unknown as never;
    const flow = new FilterDetailFlow(
      filtersService,
      { record } as unknown as never,
    );
    return { flow, data };
  }

  it('record 为永不 settle 的 pending：viewFilterDetail 仍即刻 resolve（3.1）', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const record = jest.fn().mockReturnValue(gate);
    const { flow, data } = buildFlow(record);

    const result = await flow.viewFilterDetail('cust-A', 'flt-1', 'corr-1');

    // 断言此处时 gate 仍未释放 —— 响应不等写完成
    expect(record).toHaveBeenCalledWith('cust-A', 'flt-1', 'corr-1');
    expect(result).toBe(data);
    release();
  });

  it('匿名（customerId 缺失）：不发起任何记录（3.3 的契约前提）', async () => {
    const record = jest.fn();
    const { flow } = buildFlow(record);
    await flow.viewFilterDetail(undefined, 'flt-1');
    expect(record).not.toHaveBeenCalled();
  });
});
