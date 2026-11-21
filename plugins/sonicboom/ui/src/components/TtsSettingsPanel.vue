<script lang="tsx">
import TtsIcon from './TtsIcon.vue';
import TtsToggle from './TtsToggle.vue';
import { defineVueComponent } from '../vue/component.ts';
import type { ActionOptionItem } from '../types.ts';
import { t, type Locale } from '../i18n/index.ts';
import {
  TTS_LIMITS,
  TTS_SPEED_PITCH_UNSUPPORTED,
  clampNumber,
  type TtsCommentMode,
  type TtsLogEntry,
  type TtsSettings,
} from '../../../shared/tts/tts-policy.ts';
import { voiceOptions } from './tts-voice-options.ts';
import { TtsAllowedUsers } from './TtsAllowedUsers.vue';
import { TtsSpecialUsers } from './TtsSpecialUsers.vue';
import { TtsTextProcessing } from './TtsTextProcessing.vue';
import { TtsVoiceTester } from './TtsVoiceTester.vue';
import TtsDisclosure from './TtsDisclosure.vue';
import TtsMasonry from './TtsMasonry.vue';
import TtsInfo from './TtsInfo.vue';

type TtsSettingsPanelProps = {
  locale: Locale;
  settings: TtsSettings;
  voices: ActionOptionItem[];
  allVoices?: ActionOptionItem[];
  providers?: ActionOptionItem[];
  refreshing?: boolean;
  catalogStatus?: string;
  providerReady?: boolean;
  /** Backend unreachable: only backend-dependent controls are disabled. */
  offline?: boolean;
  speaking: boolean;
  logs: TtsLogEntry[];
  onSettingsChange: (next: TtsSettings) => void;
  onRefreshVoices: () => void;
  onSpeak: (text: string, voice: string) => void;
};

/**
 * SonicBoom TTS settings panel. Runs inside the isolated plugin UI (never
 * the main TikTools document) and talks to the host only through the
 * restricted broker (`settings.*`, `actions.*`, `options.*`).
 */
export const TtsSettingsPanel = defineVueComponent<TtsSettingsPanelProps>(
  ['allVoices', 'providers', 'refreshing', 'catalogStatus', 'providerReady', 'offline', 'locale', 'settings', 'voices', 'speaking', 'logs', 'onSettingsChange', 'onRefreshVoices', 'onSpeak'],
  (props) => {
    const update = (patch: Partial<TtsSettings>): void => {
      props.onSettingsChange({ ...props.settings, ...patch });
    };

    const updateNumber = (key: 'defaultSpeed' | 'defaultPitch' | 'volume' | 'pointsCost', raw: string): void => {
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      switch (key) {
        case 'defaultSpeed':
          update({ defaultSpeed: clampNumber(value, TTS_LIMITS.minSpeed, TTS_LIMITS.maxSpeed, 1) });
          break;
        case 'defaultPitch':
          update({ defaultPitch: clampNumber(value, TTS_LIMITS.minPitch, TTS_LIMITS.maxPitch, 1) });
          break;
        case 'volume':
          update({ volume: clampNumber(value, TTS_LIMITS.minVolume, TTS_LIMITS.maxVolume, 1) });
          break;
        case 'pointsCost':
          update({ pointsCost: Math.round(clampNumber(value, TTS_LIMITS.minPointsCost, TTS_LIMITS.maxPointsCost, 0)) });
          break;
      }
    };

    const setCommentMode = (mode: TtsCommentMode): void => {
      update({ commentMode: mode });
    };

    return () => {
      const settings = props.settings;
      const locale = props.locale;
      const voiceList = voiceOptions(props.voices);

      return (
        <div>
          <TtsMasonry>
            <section class="tts-card">
              <h4 class="tts-card__title"><TtsIcon name="voice"/>{t(locale, 'ttsGeneralSettings')}</h4>
              <TtsToggle label={t(locale, 'ttsEnabled')} hint={t(locale, 'ttsEnabled')} checked={settings.enabled} onChange={(checked: boolean) => update({ enabled: checked })}/>
              <div class="tts-row tts-row--stack">
                <label class="tts-label" for="tts-language">{t(locale, 'ttsLanguage')}</label>
                <input
                  id="tts-language"
                  class="tts-input"
                  type="text"
                  value={settings.language}
                  maxlength={TTS_LIMITS.maxLanguageLength}
                  placeholder="en"
                  onInput={(event) => update({ language: (event.currentTarget as HTMLInputElement).value.slice(0, TTS_LIMITS.maxLanguageLength) || 'en' })}
                />
              </div>
              {(props.providers?.length ?? 0) > 1 && <div class="tts-row tts-row--stack">
                <div class="tts-label-row">
                  <label class="tts-label" for="tts-provider">{t(locale, 'ttsProvider')}</label>
                  <TtsInfo text={t(locale, 'ttsProviderHint')}/>
                </div>
                <select id="tts-provider" class="tts-select" value={settings.providerId} onChange={event => update({ providerId: (event.currentTarget as HTMLSelectElement).value })}>
                  {!props.providers?.some(p => p.value === settings.providerId) && <option value={settings.providerId} disabled>{settings.providerId} — {t(locale, 'ttsProviderUnavailable')}</option>}
                  {props.providers?.map(p => <option key={p.value} value={p.value} disabled={p.disabled}>{p.label.replace('(loading)', `(${t(locale, 'ttsProviderLoading')})`).replace('(not_installed)', `(${t(locale, 'ttsProviderMissing')})`).replace('(error)', `(${t(locale, 'ttsProviderError')})`)}</option>)}
                </select>
              </div>}
              {/* The global connection banner already explains these while offline. */}
              {!props.offline && props.providerReady === false && <p role="status">{t(locale, 'ttsProviderUnavailable')} ({settings.providerId})</p>}
              {!props.offline && props.catalogStatus && <p role="status">{props.catalogStatus}</p>}
              {!props.offline && props.voices.length === 0 && <p role="status">{t(locale, 'ttsNoProviderVoices')}</p>}
              <div class="tts-row tts-row--stack">
                <label class="tts-label" for="tts-default-voice">{t(locale, 'ttsDefaultVoice')}</label>
                <select
                  id="tts-default-voice"
                  class="tts-select"
                  value={settings.defaultVoice}
                  onChange={(event) => update({ defaultVoice: (event.currentTarget as HTMLSelectElement).value })}
                >
                  <option value="">{t(locale, 'ttsAutoFirstAvailable')}</option>
                  {voiceList.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <TtsToggle label={t(locale, 'ttsRandomVoice')} hint={t(locale, 'ttsRandomHint')} checked={settings.randomVoice} onChange={(checked: boolean) => update({ randomVoice: checked })}/>
              <TtsDisclosure class="tts-subgroup" title={t(locale, 'ttsVoiceAdvanced')} icon="sliders"><div class="tts-row tts-row--stack">
                <label class="tts-label" for="tts-speed">
                  {t(locale, 'ttsDefaultSpeed')} <span class="tts-value">{settings.defaultSpeed.toFixed(2)}×</span>
                </label>
                <input
                  id="tts-speed"
                  class="tts-range"
                  type="range"
                  min={TTS_LIMITS.minSpeed}
                  max={TTS_LIMITS.maxSpeed}
                  step="0.05"
                  value={settings.defaultSpeed}
                  disabled={TTS_SPEED_PITCH_UNSUPPORTED}
                  onInput={(event) => updateNumber('defaultSpeed', (event.currentTarget as HTMLInputElement).value)}
                />
              </div>
              <div class="tts-row tts-row--stack">
                <label class="tts-label" for="tts-pitch">
                  {t(locale, 'ttsDefaultPitch')} <span class="tts-value">{settings.defaultPitch.toFixed(2)}×</span>
                </label>
                <input
                  id="tts-pitch"
                  class="tts-range"
                  type="range"
                  min={TTS_LIMITS.minPitch}
                  max={TTS_LIMITS.maxPitch}
                  step="0.05"
                  value={settings.defaultPitch}
                  disabled={TTS_SPEED_PITCH_UNSUPPORTED}
                  onInput={(event) => updateNumber('defaultPitch', (event.currentTarget as HTMLInputElement).value)}
                />
              </div>
              {TTS_SPEED_PITCH_UNSUPPORTED && (
                <TtsInfo text={t(locale, 'ttsSpeedPitchNote')}/>
              )}
              </TtsDisclosure><div class="tts-row tts-row--stack">
                <label class="tts-label" for="tts-volume">
                  {t(locale, 'ttsVolume')} <span class="tts-value">{Math.round(settings.volume * 100)}%</span>
                </label>
                <input
                  id="tts-volume"
                  class="tts-range"
                  type="range"
                  min={TTS_LIMITS.minVolume}
                  max={TTS_LIMITS.maxVolume}
                  step="0.01"
                  value={settings.volume}
                  onInput={(event) => updateNumber('volume', (event.currentTarget as HTMLInputElement).value)}
                />
              </div>
            </section>

            {/* Tall first: short cards can backfill beneath it in the masonry. */}
            <TtsTextProcessing
              locale={locale}
              settings={settings}
              onSettingsChange={props.onSettingsChange}
            />
            <TtsVoiceTester
              refreshing={props.refreshing}
              unavailable={props.providerReady === false || props.voices.length === 0}
              offline={props.offline}
              locale={locale}
              voices={props.voices}
              speaking={props.speaking}
              logs={props.logs}
              defaultVoice={settings.defaultVoice}
              onSpeak={props.onSpeak}
              onRefreshVoices={props.onRefreshVoices}
            />
            <TtsAllowedUsers
              locale={locale}
              settings={settings}
              onSettingsChange={props.onSettingsChange}
            />

            <section class="tts-card">
              <h4 class="tts-card__title"><TtsIcon name="message"/>{t(locale, 'ttsCommentTypes')}</h4>
              <label class="tts-check" title={t(locale, 'ttsAnyComment')}>
<input type="radio" name="tts-comment-mode" checked={settings.commentMode === 'any'} onChange={() => setCommentMode('any')} />
                {t(locale, 'ttsAnyComment')}
              </label>
              <label class="tts-check" title={t(locale, 'ttsStartsWithDot')}>
<input type="radio" name="tts-comment-mode" checked={settings.commentMode === 'dot'} onChange={() => setCommentMode('dot')} />
                {t(locale, 'ttsStartsWithDot')}
              </label>
              <label class="tts-check" title={t(locale, 'ttsStartsWithSlash')}>
<input type="radio" name="tts-comment-mode" checked={settings.commentMode === 'slash'} onChange={() => setCommentMode('slash')} />
                {t(locale, 'ttsStartsWithSlash')}
              </label>
              <label class="tts-check" title={t(locale, 'ttsStartsWithCommand')}>
<input type="radio" name="tts-comment-mode" checked={settings.commentMode === 'command'} onChange={() => setCommentMode('command')} />
                {t(locale, 'ttsStartsWithCommand')}
              </label>
              {settings.commentMode === 'command' && (<div class="tts-row tts-row--stack">
                <label class="tts-label" for="tts-command">{t(locale, 'ttsCommand')}</label>
                <input
                  id="tts-command"
                  class="tts-input"
                  type="text"
                  value={settings.command}
                  maxlength={TTS_LIMITS.maxCommandLength}
                  disabled={settings.commentMode !== 'command'}
                  placeholder="!tts"
                  onInput={(event) => update({ command: (event.currentTarget as HTMLInputElement).value.slice(0, TTS_LIMITS.maxCommandLength) || '!tts' })}
                />
              </div>)}
              {settings.commentMode !== 'any' && <TtsToggle label={t(locale, 'ttsStripCommand')} hint={t(locale, 'ttsStripCommand')} checked={settings.stripCommand} onChange={(checked: boolean) => update({ stripCommand: checked })}/>}
            </section>

            <section class="tts-card">
              <h4 class="tts-card__title"><TtsIcon name="coins"/>{t(locale, 'ttsChargePoints')}</h4>
              <label class="tts-check" title={t(locale, 'ttsFree')}>
                <input type="radio" name="tts-points-mode" checked={!settings.chargePoints} onChange={() => update({ chargePoints: false })} />
                {t(locale, 'ttsFree')}
              </label>
              <label class="tts-check" title={t(locale, 'ttsChargePerMessage')}>
                <input type="radio" name="tts-points-mode" checked={settings.chargePoints} onChange={() => update({ chargePoints: true })} />
                {t(locale, 'ttsChargePerMessage')}
              </label>
              {settings.chargePoints && (<div class="tts-row tts-row--stack">
                <label class="tts-label" for="tts-points-cost">{t(locale, 'ttsPointsCost')}</label>
                <input
                  id="tts-points-cost"
                  class="tts-input"
                  type="number"
                  min={TTS_LIMITS.minPointsCost}
                  max={TTS_LIMITS.maxPointsCost}
                  value={settings.pointsCost}
                  onInput={(event) => updateNumber('pointsCost', (event.currentTarget as HTMLInputElement).value)}
                />
              </div>)}
              <TtsDisclosure class="tts-note" title={t(locale, 'ttsCostNote')}>
                <p class="tts-hint">{t(locale, 'ttsCostNoteDetail')}</p>
              </TtsDisclosure>
            </section>

            <div data-masonry-span="all">
              <TtsSpecialUsers
                locale={locale}
                settings={settings}
                voices={props.allVoices ?? props.voices}
                providers={props.providers}
                onSettingsChange={props.onSettingsChange}
              />
            </div>
          </TtsMasonry>
        </div>
      );
    };
  },
);

export default TtsSettingsPanel;
</script>
