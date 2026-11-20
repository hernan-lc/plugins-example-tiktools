<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { PluginBroker } from '@tiktools/plugin-ui';
import {
  accessRow,
  commandView,
  invitationToken,
  parseReply,
  requestRow,
  rowsOf,
  stringsFor,
  teamRow,
  validHostId,
  type AccessRow,
  type ActionReply,
  type RequestRow,
  type TeamRow,
} from './model.ts';

/**
 * Remote control page. Every name, id and answer here comes from the host through this
 * plugin's own actions; nothing is stored in the page. Tokens are shown once and never kept.
 */
const broker = new PluginBroker();
const locale = ref('en');
const t = computed(() => stringsFor(locale.value));

const busy = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);

const cloudState = ref<string>('');
const link = ref<{ state: string; hostId: string | null; lastError: string | null }>({ state: '', hostId: null, lastError: null });

const teams = ref<TeamRow[]>([]);
const teamName = ref('');
const selectedTeam = ref<string | null>(null);
const hostInput = ref('');

const grants = ref<AccessRow[]>([]);
const requests = ref<RequestRow[]>([]);
const decideRole = ref<Record<string, string>>({});
const pendingRevoke = ref<string | null>(null);

const inviteRole = ref('observer');
const inviteToken = ref<string | null>(null);

const commandOperation = ref('automation.list');
const commandStatus = ref<string | null>(null);
const commandCode = ref<string | null>(null);
const commandBody = ref<string>('');
const operations = ['automation.list', 'live.status', 'workflow.list', 'competition.list', 'points.read', 'command.outcome'];
const roles = computed(() => [
  { value: 'observer', label: t.value.roleObserver },
  { value: 'moderator', label: t.value.roleModerator },
  { value: 'automationEditor', label: t.value.roleEditor },
]);

async function run(action: string, config: Record<string, unknown>) {
  const reply = (await broker.executeAction(action, config)) as ActionReply;
  return parseReply<Record<string, unknown>>(reply);
}

function fail(result: { ok: false; error: string }) {
  error.value = result.error;
}

/** The host to act on: the chosen team, or the identifier typed in the field. */
function currentHost(): string | null {
  const id = validHostId(selectedTeam.value ?? hostInput.value);
  if (!id) error.value = t.value.noTeams;
  return id;
}

async function loadStatus() {
  const result = await run('tiktools.remote-control.status', {});
  if (!result.ok) return fail(result);
  const value = result.value as { cloud?: { state?: string }; link?: { state?: string; hostId?: string | null; lastError?: string | null } };
  cloudState.value = value.cloud?.state ?? '';
  link.value = {
    state: value.link?.state ?? '',
    hostId: value.link?.hostId ?? null,
    lastError: value.link?.lastError ?? null,
  };
}

async function loadTeams() {
  const result = await run('tiktools.remote-control.teams.list', {});
  if (!result.ok) return fail(result);
  teams.value = rowsOf(result.value, 'items').map(teamRow).filter((row): row is TeamRow => row !== null);
  if (!selectedTeam.value && teams.value.length) selectedTeam.value = teams.value[0]?.id ?? null;
}

async function loadTeam() {
  const host = currentHost();
  if (!host) return;
  busy.value = true;
  error.value = null;
  try {
    const [grantsReply, requestsReply] = await Promise.all([
      run('tiktools.remote-control.grants.list', { hostId: host }),
      run('tiktools.remote-control.requests.list', { hostId: host }),
    ]);
    if (!grantsReply.ok) return fail(grantsReply);
    if (!requestsReply.ok) return fail(requestsReply);
    grants.value = rowsOf(grantsReply.value, 'items').map(accessRow).filter((row): row is AccessRow => row !== null);
    requests.value = rowsOf(requestsReply.value, 'items').map(requestRow).filter((row): row is RequestRow => row !== null);
  } finally {
    busy.value = false;
  }
}

async function createTeam() {
  const name = teamName.value.trim();
  if (!name) return (error.value = t.value.teamCreate);
  busy.value = true;
  try {
    const result = await run('tiktools.remote-control.team.create', { name });
    if (!result.ok) return fail(result);
    teamName.value = '';
    await loadTeams();
    const created = teamRow(result.value);
    if (created) selectedTeam.value = created.id;
  } finally {
    busy.value = false;
  }
}

async function enroll(kind: 'host' | 'controller') {
  const label = kind === 'host' ? t.value.thisPc : t.value.thisPc;
  const config: Record<string, unknown> = { kind, label };
  if (kind === 'host') {
    const host = currentHost();
    if (!host) return;
    config.hostId = host;
  }
  busy.value = true;
  try {
    const result = await run('tiktools.remote-control.device.enroll', config);
    if (!result.ok) return fail(result);
    notice.value = t.value.enrolled;
  } finally {
    busy.value = false;
  }
}

async function toggleLink(start: boolean) {
  busy.value = true;
  error.value = null;
  try {
    const result = await run(start ? 'tiktools.remote-control.host.start' : 'tiktools.remote-control.host.stop', {});
    if (!result.ok) return fail(result);
    await loadStatus();
  } finally {
    busy.value = false;
  }
}

async function invite() {
  const host = currentHost();
  if (!host) return;
  busy.value = true;
  error.value = null;
  inviteToken.value = null;
  try {
    const result = await run('tiktools.remote-control.invitation.create', {
      hostId: host,
      requestedRole: inviteRole.value,
      ttlSeconds: 600,
    });
    if (!result.ok) return fail(result);
    inviteToken.value = invitationToken(result.value);
    if (!inviteToken.value) error.value = t.value.failed;
  } finally {
    busy.value = false;
  }
}

async function decide(row: RequestRow, decision: 'approve' | 'deny') {
  const host = currentHost();
  if (!host) return;
  busy.value = true;
  error.value = null;
  try {
    const config: Record<string, unknown> = { hostId: host, requestId: row.id, decision };
    const role = decideRole.value[row.id] ?? row.role;
    if (decision === 'approve' && role) config.role = role;
    const result = await run('tiktools.remote-control.requests.decide', config);
    if (!result.ok) return fail(result);
    notice.value = t.value.decided;
    await loadTeam();
  } finally {
    busy.value = false;
  }
}

async function revoke(row: AccessRow) {
  const host = currentHost();
  if (!host) return;
  if (pendingRevoke.value !== row.id) {
    pendingRevoke.value = row.id;
    return;
  }
  if (row.revision === null) return (error.value = t.value.noRevision);
  busy.value = true;
  try {
    const result = await run('tiktools.remote-control.grants.revoke', { hostId: host, grantId: row.id, revision: row.revision });
    if (!result.ok) return fail(result);
    notice.value = t.value.revoked(row.label);
    pendingRevoke.value = null;
    await loadTeam();
  } finally {
    busy.value = false;
  }
}

async function runCommand() {
  const host = currentHost();
  if (!host) return;
  busy.value = true;
  error.value = null;
  commandStatus.value = null;
  commandCode.value = null;
  commandBody.value = '';
  try {
    const result = await run('tiktools.remote-control.command.run', { hostId: host, operation: commandOperation.value, args: {} });
    if (!result.ok) return fail(result);
    const outcome = commandView((result.value.outcome ?? {}) as Record<string, unknown>);
    commandStatus.value = outcome.status;
    commandCode.value = outcome.code;
    commandBody.value = outcome.body || t.value.commandNoResult;
  } finally {
    busy.value = false;
  }
}

function useTypedHost() {
  const id = validHostId(hostInput.value);
  if (id) selectedTeam.value = id;
}

onMounted(async () => {
  try {
    locale.value = await broker.getLocale();
  } catch {
    // Keep English when the host does not report a locale.
  }
  await loadStatus();
  await loadTeams();
  if (selectedTeam.value) await loadTeam();
});
</script>

<template>
  <main class="remote">
    <header class="remote__header">
      <h1>{{ t.title }}</h1>
      <p class="remote__lede">{{ t.lede }}</p>
    </header>

    <p
      v-if="error"
      class="alert"
      role="alert"
    >
      {{ error }}
    </p>
    <p
      v-if="notice"
      class="notice"
      role="status"
    >
      {{ notice }}
    </p>

    <section
      class="card"
      aria-labelledby="remote-status"
    >
      <h2 id="remote-status">{{ t.status }}</h2>
      <dl class="facts">
        <dt>{{ t.cloud }}</dt>
        <dd>{{ cloudState === 'signed-in' ? t.cloudSignedIn : cloudState === 'signed-out' ? t.cloudSignedOut : t.cloudUnavailable }}</dd>
        <dt>{{ t.linkState }}</dt>
        <dd>{{ link.state || t.cloudUnavailable }}<span v-if="link.lastError"> — {{ link.lastError }}</span></dd>
      </dl>
      <div class="row-actions">
        <button
          type="button"
          :disabled="busy"
          @click="toggleLink(true)"
        >
          {{ t.linkStart }}
        </button>
        <button
          type="button"
          :disabled="busy"
          @click="toggleLink(false)"
        >
          {{ t.linkStop }}
        </button>
      </div>
    </section>

    <section
      class="card"
      aria-labelledby="remote-teams"
    >
      <h2 id="remote-teams">{{ t.teams }}</h2>
      <p
        v-if="!teams.length"
        class="hint"
      >
        {{ t.noTeams }}
      </p>
      <ul
        v-else
        class="rows"
      >
        <li
          v-for="team in teams"
          :key="team.id"
          class="row"
          :class="{ 'row--selected': selectedTeam === team.id }"
        >
          <button
            type="button"
            class="row__select"
            @click="selectedTeam = team.id; loadTeam()"
          >
            {{ team.name }}
          </button>
          <span class="row__meta">{{ team.status }}</span>
        </li>
      </ul>
      <form
        class="inline"
        @submit.prevent="createTeam"
      >
        <label for="remote-team-name">{{ t.teamName }}</label>
        <input
          id="remote-team-name"
          v-model="teamName"
          maxlength="80"
        >
        <button
          type="submit"
          :disabled="busy"
        >
          {{ t.create }}
        </button>
      </form>
      <form
        class="inline"
        @submit.prevent="useTypedHost"
      >
        <label for="remote-host-id">{{ t.hostLabel }}</label>
        <input
          id="remote-host-id"
          v-model="hostInput"
          maxlength="128"
          autocomplete="off"
          :placeholder="t.hostPlaceholder"
        >
        <button type="submit">
          {{ t.load }}
        </button>
      </form>
    </section>

    <section
      class="card"
      aria-labelledby="remote-this-pc"
    >
      <h2 id="remote-this-pc">{{ t.thisPc }}</h2>
      <div class="row-actions">
        <button
          type="button"
          :disabled="busy || !selectedTeam"
          @click="enroll('host')"
        >
          {{ t.enrollHost }}
        </button>
        <button
          type="button"
          :disabled="busy"
          @click="enroll('controller')"
        >
          {{ t.enrollController }}
        </button>
      </div>
    </section>

    <section
      class="card"
      aria-labelledby="remote-invite"
    >
      <h2 id="remote-invite">{{ t.invite }}</h2>
      <div class="inline">
        <label for="remote-invite-role">{{ t.inviteRole }}</label>
        <select
          id="remote-invite-role"
          v-model="inviteRole"
        >
          <option
            v-for="role in roles"
            :key="role.value"
            :value="role.value"
          >
            {{ role.label }}
          </option>
        </select>
        <button
          type="button"
          :disabled="busy || !selectedTeam"
          @click="invite"
        >
          {{ t.inviteCreate }}
        </button>
      </div>
      <div
        v-if="inviteToken"
        class="token"
      >
        <span>{{ t.inviteToken }}</span>
        <code class="token__value">{{ inviteToken }}</code>
        <span class="hint">{{ t.inviteOnce }}</span>
      </div>
    </section>

    <section
      class="card"
      aria-labelledby="remote-requests"
    >
      <h2 id="remote-requests">{{ t.requests }}</h2>
      <p
        v-if="!requests.length"
        class="hint"
      >
        {{ t.noRequests }}
      </p>
      <ul
        v-else
        class="rows"
      >
        <li
          v-for="row in requests"
          :key="row.id"
          class="row"
        >
          <span class="row__label">{{ row.label }}</span>
          <span class="row__meta">{{ row.role }}</span>
          <div class="row-actions">
            <button
              type="button"
              :disabled="busy"
              @click="decide(row, 'approve')"
            >
              {{ t.approve }}
            </button>
            <button
              type="button"
              class="danger"
              :disabled="busy"
              @click="decide(row, 'deny')"
            >
              {{ t.deny }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section
      class="card"
      aria-labelledby="remote-access"
    >
      <h2 id="remote-access">{{ t.access }}</h2>
      <p
        v-if="!grants.length"
        class="hint"
      >
        {{ t.noAccess }}
      </p>
      <ul
        v-else
        class="rows"
      >
        <li
          v-for="row in grants"
          :key="row.id"
          class="row"
        >
          <span class="row__label">{{ row.label }}</span>
          <span class="row__meta">{{ t.revision }} {{ row.revision ?? '—' }}</span>
          <button
            type="button"
            class="danger"
            :disabled="busy"
            @click="revoke(row)"
          >
            {{ pendingRevoke === row.id ? t.confirmRevoke : t.revoke }}
          </button>
        </li>
      </ul>
    </section>

    <section
      class="card"
      aria-labelledby="remote-command"
    >
      <h2 id="remote-command">{{ t.command }}</h2>
      <div class="inline">
        <label for="remote-operation">{{ t.commandOperation }}</label>
        <select
          id="remote-operation"
          v-model="commandOperation"
        >
          <option
            v-for="operation in operations"
            :key="operation"
            :value="operation"
          >
            {{ operation }}
          </option>
        </select>
        <button
          type="button"
          :disabled="busy || !selectedTeam"
          @click="runCommand"
        >
          {{ t.commandRun }}
        </button>
      </div>
      <p
        v-if="commandStatus"
        class="hint"
      >
        {{ t.commandStatus }}: {{ commandStatus }}<span v-if="commandCode"> ({{ commandCode }})</span>
      </p>
      <pre
        v-if="commandBody"
        class="result"
      >{{ commandBody }}</pre>
    </section>
  </main>
</template>
