import { validate } from 'class-validator';
import { UpdateInquiryStatusDto } from './update-inquiry-status.dto';

describe('UpdateInquiryStatusDto（quoted 必须携带 expiresAt）', () => {
  it('status=quoted 且缺 expiresAt → 400（QUOTED_REQUIRES_EXPIRES_AT）', async () => {
    const dto = new UpdateInquiryStatusDto();
    dto.status = 'quoted';

    const errors = await validate(dto);
    const codes = errors.flatMap((e) =>
      Object.values(e.constraints ?? {}),
    );
    expect(codes).toContain('QUOTED_REQUIRES_EXPIRES_AT');
  });

  it('status=quoted 且携带 expiresAt → 通过', async () => {
    const dto = new UpdateInquiryStatusDto();
    dto.status = 'quoted';
    dto.expiresAt = '2026-12-31';

    expect(await validate(dto)).toHaveLength(0);
  });

  it('status=submitted 不受该约束影响（expiresAt 可省）', async () => {
    const dto = new UpdateInquiryStatusDto();
    dto.status = 'submitted';

    expect(await validate(dto)).toHaveLength(0);
  });

  it('status=quoted 且 expiresAt 为空字符串 → 仍拒绝', async () => {
    const dto = new UpdateInquiryStatusDto();
    dto.status = 'quoted';
    dto.expiresAt = '';

    const errors = await validate(dto);
    const codes = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(codes).toContain('QUOTED_REQUIRES_EXPIRES_AT');
  });
});
