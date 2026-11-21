<script lang="tsx">
import TtsIcon from './TtsIcon.vue';
import { defineVueComponent } from '../vue/component.ts';
import { t, type Locale } from '../i18n/index.ts';

type TtsConnectionBannerProps = {
  locale: Locale;
  /** Raw broker/HTTP failure shown once, here instead of on every card. */
  detail: string;
  retrying?: boolean;
  onRetry: () => void;
};

/**
 * Single connection-failure surface. All broker calls share the same
 * SonicBoom backend, so one banner with one retry action replaces the
 * per-card HTTP alerts that used to duplicate the same failure.
 */
export const TtsConnectionBanner = defineVueComponent<TtsConnectionBannerProps>(
  ['locale', 'detail', 'retrying', 'onRetry'],
  (props) => {
    return () => {
      const locale = props.locale;
      return (
        <div class="tts-connection" role="status" aria-live="polite">
          <TtsIcon name="info"/>
          <div class="tts-connection__text">
            <strong>{t(locale, 'ttsConnectionLost')}</strong>
            <span class="tts-connection__hint">{t(locale, 'ttsConnectionHint')}</span>
            <span class="tts-connection__detail" title={props.detail}>{props.detail}</span>
          </div>
          <button
            type="button"
            class="plg-btn plg-btn--sm"
            disabled={props.retrying}
            aria-busy={props.retrying}
            onClick={props.onRetry}
          >
            <TtsIcon name="refresh"/>{t(locale, props.retrying ? 'ttsReloading' : 'ttsRetryConnection')}
          </button>
        </div>
      );
    };
  },
);

export default TtsConnectionBanner;
</script>
