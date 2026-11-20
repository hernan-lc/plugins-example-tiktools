import { describe, expect, it } from 'bun:test';
import { accessRow, parseReply, rowsOf, validHostId } from './model.ts';

describe('remote control view model', () => {
  it('reads the JSON answer from a successful action and reports failures verbatim', () => {
    expect(parseReply<{ gateway: string }>({ ok: true, summary: '{"gateway":"not-included"}' })).toEqual({
      ok: true,
      value: { gateway: 'not-included' },
    });
    expect(parseReply({ ok: false, summary: '', error: 'collaboration is disabled' })).toEqual({
      ok: false,
      error: 'collaboration is disabled',
    });
    expect(parseReply({ ok: true, summary: 'not json' }).ok).toBe(false);
  });

  it('accepts only bounded host identifiers', () => {
    expect(validHostId('  host-1 ')).toBe('host-1');
    expect(validHostId('   ')).toBeNull();
    expect(validHostId('a'.repeat(129))).toBeNull();
  });

  it('reads lists whether the host returns a bare array or an object', () => {
    expect(rowsOf([{ grantId: 'g1' }, 7, null], 'grants')).toEqual([{ grantId: 'g1' }]);
    expect(rowsOf({ grants: [{ id: 'g2' }] }, 'grants')).toEqual([{ id: 'g2' }]);
    expect(rowsOf({ other: 1 }, 'grants')).toEqual([]);
  });

  it('keeps a grant only when it has an id, with a readable label and its revision', () => {
    expect(accessRow({ grantId: 'g1', principalLabel: 'Ana', revision: 3 })).toEqual({ id: 'g1', label: 'Ana', revision: 3 });
    expect(accessRow({ id: 'g2' })).toEqual({ id: 'g2', label: 'g2', revision: null });
    expect(accessRow({ revision: 1 })).toBeNull();
    expect(accessRow({ grantId: 'x'.repeat(129) })).toBeNull();
  });
});
