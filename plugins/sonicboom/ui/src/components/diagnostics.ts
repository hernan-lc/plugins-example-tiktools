/** Typed view of the `sonicboom.speech-status` broker event. The payload is
 * host-owned JSON, so every field is validated here at the boundary instead of
 * being cast by the renderer. */

export type TtsDiagnostic = {
  stage?: string;
  connection?: string;
  queueDepth?: number;
  lastResult?: string;
  counters: Array<{ key: string; value: number; label: string }>;
};

/** Counters pushed by the SonicBoom backend, in display order. `label` is an
 * i18n key so numbers stay readable in both UI locales. */
export const DIAGNOSTIC_COUNTERS = [
  { key: 'observed', label: 'ttsCounterObserved' },
  { key: 'filtered', label: 'ttsCounterFiltered' },
  { key: 'expired', label: 'ttsCounterExpired' },
  { key: 'missingVoices', label: 'ttsCounterMissingVoices' },
  { key: 'submitted', label: 'ttsCounterSubmitted' },
  { key: 'playbackAdmitted', label: 'ttsCounterPlaybackAdmitted' },
  { key: 'running', label: 'ttsCounterRunning' },
  { key: 'completed', label: 'ttsCounterCompleted' },
  { key: 'failed', label: 'ttsCounterFailed' },
  { key: 'cancelled', label: 'ttsCounterCancelled' },
  { key: 'saturation', label: 'ttsCounterSaturation' },
  { key: 'duplicates', label: 'ttsCounterDuplicates' },
  { key: 'playbackQueued', label: 'ttsCounterPlaybackQueued' },
  { key: 'playbackStarted', label: 'ttsCounterPlaybackStarted' },
  { key: 'playbackFailed', label: 'ttsCounterPlaybackFailed' },
  { key: 'timedOut', label: 'ttsCounterTimedOut' },
  { key: 'providerUnavailable', label: 'ttsCounterProviderUnavailable' },
] as const;

export type DiagnosticTone = 'neutral' | 'ok' | 'warn' | 'error';

const readText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const readCount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;

/** Returns `undefined` until a meaningful status event arrives, so the UI can
 * show a single "waiting" state instead of a row of dashes. */
export const readDiagnostic = (value: Record<string, unknown> | undefined): TtsDiagnostic | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const rawCounters = value.counters;
  const countersSource = rawCounters && typeof rawCounters === 'object' && !Array.isArray(rawCounters)
    ? rawCounters as Record<string, unknown>
    : undefined;
  const counters = countersSource
    ? DIAGNOSTIC_COUNTERS.flatMap(({ key, label }) => {
        const count = readCount(countersSource[key]);
        return count === undefined ? [] : [{ key, value: count, label }];
      })
    : [];
  const diagnostic: TtsDiagnostic = {
    stage: readText(value.stage),
    connection: readText(value.connection),
    queueDepth: readCount(value.queueDepth),
    lastResult: readText(value.lastResult),
    counters,
  };
  const hasData = diagnostic.stage || diagnostic.connection || diagnostic.lastResult ||
    diagnostic.queueDepth !== undefined || counters.length > 0;
  return hasData ? diagnostic : undefined;
};

/** Backend states are `idle`, `running`, `degraded` and `stopped`; anything
 * else (including no data) stays neutral rather than implying a failure. */
export const connectionTone = (connection: string | undefined): DiagnosticTone => {
  switch (connection) {
    case 'running': return 'ok';
    case 'degraded': return 'warn';
    case 'stopped':
    case 'error':
    case 'failed': return 'error';
    default: return 'neutral';
  }
};
