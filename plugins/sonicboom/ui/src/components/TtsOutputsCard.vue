<script lang="tsx">
import TtsIcon from './TtsIcon.vue';
import TtsInfo from './TtsInfo.vue';
import { defineVueComponent } from '../vue/component.ts';

import type { ActionOptionItem } from '../types.ts';
import { t, type Locale } from '../i18n/index.ts';
import { outputOptions, outputsCardState } from './source.ts';

type TtsOutputsCardProps = {
  locale: Locale;
  /** False when the section declares no outputs source: the card hides. */
  outputsSupported: boolean;
  /** Server output options; undefined while the first fetch is in flight. */
  outputs?: ActionOptionItem[];
  /** Fetch failure; hides the selector but never the panel. */
  outputsError?: string;
  /** Server-reported active output; the authoritative selection. */
  outputsSelected?: string;
  /** Device currently being switched to; disables the selector. */
  outputsPending?: string;
  /** Last switch failure; the selector keeps showing server state. */
  outputError?: string;
  /** Backend unreachable: the selector cannot work; refresh stays available. */
  offline?: boolean;
  /** Rendered inside the Audio card: suppress the duplicate card header. */
  embedded?: boolean;
  /** The Audio card header owns the refresh button when embedded. */
  showRefresh?: boolean;
  onSelectOutput?: (device: string) => void;
  onRefreshOutputs?: () => void;
};

/**
 * Server-side audio output selector. The select always shows server
 * state: the live selection while a switch is in flight, else the
 * server-reported active output. Failures never persist locally — the
 * selector falls back to the last confirmed server value.
 */
export const TtsOutputsCard = defineVueComponent<TtsOutputsCardProps>(
  ['locale', 'outputsSupported', 'outputs', 'outputsError', 'outputsSelected', 'outputsPending', 'outputError', 'offline', 'embedded', 'showRefresh', 'onSelectOutput', 'onRefreshOutputs'],
  (props) => {
  return () => {
  const locale = props.locale;
  const state = outputsCardState({
    supported: props.outputsSupported,
    outputs: props.outputs,
    outputsError: props.outputsError,
  });
  if (state.kind === 'hidden') return null;
  const refresh = () => props.onRefreshOutputs?.();
  // Refresh stays enabled while offline: it is the recovery action itself.
  const refreshButton = (
    <button type="button" class="plg-btn plg-btn--sm" onClick={refresh}>
      <TtsIcon name="refresh"/>{t(locale, 'ttsRefreshOutputs')}
    </button>
  );
  const refreshRow = props.showRefresh === false ? null : <div class="tts-row">{refreshButton}</div>;
  if (state.kind === 'loading') {
    return (
      <section class="tts-card">
        {props.embedded ? null : <h4 class="tts-card__title"><TtsIcon name="audio"/>{t(locale, 'ttsAudioOutput')}</h4>}
        <span class="plg-group-note">{t(locale, 'ttsAudioOutputsLoading')}</span>
      </section>
    );
  }
  if (state.kind === 'unavailable') {
    return (
      <section class="tts-card">
        {props.embedded ? null : <h4 class="tts-card__title"><TtsIcon name="audio"/>{t(locale, 'ttsAudioOutput')}</h4>}
        {props.offline
          ? <p class="tts-hint">{t(locale, 'ttsRequiresConnection')}</p>
          : <div class="plg-alert" role="status">
              {state.unsupported ? t(locale, 'ttsAudioOutputsNoPlayback') : t(locale, 'ttsAudioOutputsUnavailable')}
            </div>}
        {refreshRow}
      </section>
    );
  }
  if (state.kind === 'empty') {
    return (
      <section class="tts-card">
        {props.embedded ? null : <h4 class="tts-card__title"><TtsIcon name="audio"/>{t(locale, 'ttsAudioOutput')}</h4>}
        <span class="plg-group-note">{t(locale, 'ttsAudioOutputsEmpty')}</span>
        {refreshRow}
      </section>
    );
  }
  const current = props.outputsPending || props.outputsSelected || '';
  const rows = outputOptions(props.outputs ?? [], current);
  const switching = !!props.outputsPending;
  const disabled = switching || !!props.offline;
  return (
    <section class="tts-card">
      {props.embedded ? null : <h4 class="tts-card__title"><TtsIcon name="audio"/>{t(locale, 'ttsAudioOutput')}</h4>}
      {props.outputError && !props.offline && <div class="plg-alert" role="status">{props.outputError}</div>}
      <div class="tts-row tts-outputs-row">
        <label class="tts-label" for="tts-audio-output">{t(locale, 'ttsAudioOutput')}</label>
        <select
          id="tts-audio-output"
          class="tts-select"
          value={current}
          disabled={disabled}
          title={props.offline ? t(locale, 'ttsRequiresConnection') : undefined}
          onChange={(event) => props.onSelectOutput?.((event.currentTarget as HTMLSelectElement).value)}
        >
          {current === '' && <option value="">{t(locale, 'ttsAudioOutputChoose')}</option>}
          {rows.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {props.showRefresh === false ? null : refreshButton}
        <TtsInfo
          text={props.offline ? t(locale, 'ttsRequiresConnection') : switching ? t(locale, 'ttsAudioOutputSwitching') : t(locale, 'ttsAudioOutputHint')}
          label={t(locale, 'ttsAudioOutputHelp')}
        />
      </div>
    </section>
  );
  };
  },
);

export default TtsOutputsCard;
</script>
