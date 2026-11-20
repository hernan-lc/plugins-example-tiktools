<script lang="tsx">
import TtsIcon from './TtsIcon.vue';
import TtsDisclosure from './TtsDisclosure.vue';
import { defineVueComponent } from '../vue/component.ts';
import { t, type Locale } from '../i18n/index.ts';
import { connectionTone, readDiagnostic } from './diagnostics.ts';

type TtsDiagnosticsProps = {
  locale: Locale;
  /** Raw `sonicboom.speech-status` payload; validated before rendering. */
  diagnostic: Record<string, unknown>;
  providerId: string;
  defaultVoice: string;
  ready: boolean;
  refreshing: boolean;
  onRefreshVoices: () => void;
};

/**
 * Read-only speech status view. Status fields arrive as host events, so this
 * component never fetches them: its only action is the explicit voice reload
 * (the same action the voice tester offers), clearly labelled as such.
 */
export const TtsDiagnostics = defineVueComponent<TtsDiagnosticsProps>(
  ['locale', 'diagnostic', 'providerId', 'defaultVoice', 'ready', 'refreshing', 'onRefreshVoices'],
  (props) => {
    return () => {
      const locale = props.locale;
      const data = readDiagnostic(props.diagnostic);
      const tone = connectionTone(data?.connection);
      const row = (label: string, value: string, mono = false) => (
        <div class="tts-diagnostics__item">
          <dt>{label}</dt>
          <dd class={mono ? 'tts-diagnostics__mono' : undefined}>{value}</dd>
        </div>
      );

      return (
        <div class="tts-diagnostics" aria-labelledby="tts-diagnostics-title">
          <h5 class="tts-diagnostics__title" id="tts-diagnostics-title">
            <TtsIcon name="sliders"/>{t(locale, 'ttsDiagnostics')}
          </h5>

          <dl class="tts-diagnostics__summary" aria-live="polite" aria-atomic="true">
            <div class="tts-diagnostics__item">
              <dt>{t(locale, 'ttsProvider')}</dt>
              <dd>
                {props.providerId || '—'}{' '}
                <span class={['tts-health', 'tts-diagnostics__health', { 'is-ready': props.ready }]}>
                  <span/>{t(locale, props.ready ? 'ttsReady' : 'ttsNotReady')}
                </span>
              </dd>
            </div>
            {row(t(locale, 'ttsDefaultVoice'), props.defaultVoice || '—', true)}
            {data && [
              <div class="tts-diagnostics__item">
                <dt>{t(locale, 'ttsBackend')}</dt>
                <dd>
                  <span class={['tts-status-badge', `tts-status-badge--${tone}`]}>{data.connection ?? '—'}</span>
                </dd>
              </div>,
              row(t(locale, 'ttsQueueDepth'), data.queueDepth === undefined ? '—' : String(data.queueDepth), true),
              row(t(locale, 'ttsStage'), data.stage ?? '—', true),
              <div class="tts-diagnostics__item tts-diagnostics__item--wide">
                <dt>{t(locale, 'ttsLastResult')}</dt>
                <dd>{data.lastResult ?? '—'}</dd>
              </div>,
            ]}
          </dl>

          {!data && <p class="tts-hint" role="status">{t(locale, 'ttsDiagnosticsWaiting')}</p>}

          {data && data.counters.length > 0 && (
            <TtsDisclosure class="tts-subgroup" title={t(locale, 'ttsDiagnosticsCounters')} icon="sliders">
              <dl class="tts-diagnostics__counters">
                {data.counters.map(counter => (
                  <div class="tts-diagnostics__counter" key={counter.key}>
                    <dt>{t(locale, counter.label)}</dt>
                    <dd class="tts-diagnostics__mono">{counter.value}</dd>
                  </div>
                ))}
              </dl>
            </TtsDisclosure>
          )}

          <div class="tts-row">
            <button
              type="button"
              class="plg-btn plg-btn--sm"
              disabled={props.refreshing}
              aria-busy={props.refreshing}
              onClick={props.onRefreshVoices}
            >
              <TtsIcon name="refresh"/>{t(locale, props.refreshing ? 'ttsReloading' : 'ttsRefreshVoices')}
            </button>
          </div>
        </div>
      );
    };
  },
);

export default TtsDiagnostics;
</script>
