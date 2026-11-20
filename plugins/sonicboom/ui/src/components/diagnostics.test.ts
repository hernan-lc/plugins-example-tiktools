import { expect, test } from 'bun:test';

import { connectionTone, readDiagnostic } from './diagnostics.ts';

test('diagnostics wait for a meaningful status event', () => {
  expect(readDiagnostic(undefined)).toBeUndefined();
  expect(readDiagnostic({})).toBeUndefined();
  expect(readDiagnostic({ stage: '', queueDepth: -1, counters: { failed: -3 } })).toBeUndefined();
});

test('diagnostics validate host-owned values at the boundary', () => {
  expect(readDiagnostic({
    stage: '  synthesizing  ',
    connection: 'running',
    queueDepth: 2.6,
    lastResult: 'spoken',
    ignored: { nested: true },
  })).toEqual({
    stage: 'synthesizing',
    connection: 'running',
    queueDepth: 3,
    lastResult: 'spoken',
    counters: [],
  });
  expect(readDiagnostic({ stage: 42, connection: null, queueDepth: '3', lastResult: {} })).toBeUndefined();
});

test('diagnostics show only known, numeric counters in display order', () => {
  const result = readDiagnostic({
    lastResult: 'ok',
    counters: { failed: 2, observed: 7, submitted: 4, unknown: 9, timedOut: 1.4 },
  });
  expect(result?.counters).toEqual([
    { key: 'observed', value: 7, label: 'ttsCounterObserved' },
    { key: 'submitted', value: 4, label: 'ttsCounterSubmitted' },
    { key: 'failed', value: 2, label: 'ttsCounterFailed' },
    { key: 'timedOut', value: 1, label: 'ttsCounterTimedOut' },
  ]);
});

test('connection badge tone follows backend states without guessing', () => {
  expect(connectionTone('running')).toBe('ok');
  expect(connectionTone('degraded')).toBe('warn');
  expect(connectionTone('stopped')).toBe('error');
  expect(connectionTone('idle')).toBe('neutral');
  expect(connectionTone(undefined)).toBe('neutral');
});
