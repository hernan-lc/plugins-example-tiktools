/**
 * Pure view model of the Remote control page: parses what the plugin's
 * actions return and validates what the page may send. No broker, no DOM.
 */

export interface ActionReply {
  ok: boolean;
  summary?: string;
  error?: string | null;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** The plugin answers with JSON in the action summary. Anything else is a protocol error. */
export function parseReply<T>(reply: ActionReply): Parsed<T> {
  if (!reply.ok) return { ok: false, error: reply.error || reply.summary || 'The action failed.' };
  try {
    return { ok: true, value: JSON.parse(reply.summary ?? 'null') as T };
  } catch {
    return { ok: false, error: 'The plugin returned an unreadable answer.' };
  }
}

export interface CloudState {
  state: string;
  accountId?: string | null;
  reason?: string;
}

export interface RemoteStatus {
  gateway: string;
  gatewayReason: string;
  cloud: CloudState;
}

/** Host ids are bounded the same way the plugin checks them. */
export function validHostId(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}

/** A host answer can be a bare list or an object holding the list; both are rows. */
export function rowsOf(value: unknown, key: string): Record<string, unknown>[] {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>)[key])
      ? ((value as Record<string, unknown>)[key] as unknown[])
      : [];
  return list.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
}

export interface AccessRow {
  id: string;
  label: string;
  revision: number | null;
}

/** The grant id, a readable label, and the revision the host needs to revoke it. */
export function accessRow(row: Record<string, unknown>): AccessRow | null {
  const id = [row.grantId, row.id].find((value): value is string => typeof value === 'string' && value.length > 0);
  if (!id || id.length > 128) return null;
  const label = [row.principalLabel, row.principal, row.clientLabel, row.label]
    .find((value): value is string => typeof value === 'string' && value.length > 0) ?? id;
  const revision = typeof row.revision === 'number' && Number.isSafeInteger(row.revision) ? row.revision : null;
  return { id, label, revision };
}

export interface TeamRow {
  id: string;
  name: string;
  status: string;
  revision: number | null;
}

/** A team the signed-in account owns; the id is the host id the other actions take. */
export function teamRow(row: Record<string, unknown>): TeamRow | null {
  const id = typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 128 ? row.id : null;
  if (!id) return null;
  const name = typeof row.name === 'string' && row.name.length > 0 ? row.name : id;
  const status = typeof row.status === 'string' ? row.status : 'unknown';
  const revision = typeof row.revision === 'number' && Number.isSafeInteger(row.revision) ? row.revision : null;
  return { id, name, status, revision };
}

export interface RequestRow {
  id: string;
  label: string;
  role: string;
  status: string;
}

/** A join request awaiting the owner. The label is the requesting device, never an email. */
export function requestRow(row: Record<string, unknown>): RequestRow | null {
  const id = typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 128 ? row.id : null;
  if (!id) return null;
  return {
    id,
    label: typeof row.deviceLabel === 'string' && row.deviceLabel.length > 0 ? row.deviceLabel : id,
    role: typeof row.requestedRole === 'string' ? row.requestedRole : '',
    status: typeof row.status === 'string' ? row.status : '',
  };
}

/** The one-time invitation token, when the host returned a usable one. */
export function invitationToken(value: Record<string, unknown>): string | null {
  const token = value.token;
  return typeof token === 'string' && token.length >= 32 && token.length <= 128 ? token : null;
}

export interface CommandView {
  status: string;
  code: string | null;
  body: string;
}

/** The host's answer to a read command, shown as text; a missing result is said plainly. */
export function commandView(outcome: Record<string, unknown>): CommandView {
  const status = typeof outcome.status === 'string' ? outcome.status : 'unknown';
  const code = typeof outcome.code === 'string' ? outcome.code : null;
  const body = outcome.result === undefined || outcome.result === null
    ? ''
    : JSON.stringify(outcome.result, null, 2);
  return { status, code, body };
}

export interface Strings {
  requests: string;
  noRequests: string;
  title: string;
  lede: string;
  status: string;
  gateway: string;
  cloud: string;
  gatewayNotIncluded: string;
  cloudSignedIn: string;
  cloudSignedOut: string;
  cloudUnavailable: string;
  hostSection: string;
  hostLabel: string;
  hostPlaceholder: string;
  hostInvalid: string;
  load: string;
  access: string;
  noAccess: string;
  revision: string;
  revoke: string;
  confirmRevoke: string;
  revoked: (label: string) => string;
  noRevision: string;
  failed: string;
  teams: string;
  noTeams: string;
  teamCreate: string;
  teamName: string;
  create: string;
  thisPc: string;
  enrollHost: string;
  enrollController: string;
  enrolled: string;
  linkStart: string;
  linkStop: string;
  linkState: string;
  invite: string;
  inviteRole: string;
  inviteCreate: string;
  inviteToken: string;
  inviteOnce: string;
  approve: string;
  deny: string;
  decided: string;
  roleObserver: string;
  roleModerator: string;
  roleEditor: string;
  command: string;
  commandOperation: string;
  commandRun: string;
  commandStatus: string;
  commandNoResult: string;
}

const en: Strings = {
  requests: 'Join requests',
  noRequests: 'No pending requests.',
  title: 'Remote control',
  lede: 'Who can control this host from another device, and what they are allowed to do.',
  status: 'Status',
  gateway: 'Gateway',
  cloud: 'Cloud',
  gatewayNotIncluded: 'Not included in this build',
  cloudSignedIn: 'Signed in to TikTools Cloud',
  cloudSignedOut: 'Not signed in',
  cloudUnavailable: 'Cloud state unavailable',
  hostSection: 'Cloud host',
  hostLabel: 'Host identifier',
  hostPlaceholder: 'host identifier',
  hostInvalid: 'Enter the Cloud host identifier (1 to 128 characters).',
  load: 'Load access and requests',
  access: 'Access',
  noAccess: 'No access has been granted for this host.',
  revision: 'revision',
  revoke: 'Revoke',
  confirmRevoke: 'Confirm revoke',
  revoked: (label) => `Access revoked for ${label}.`,
  noRevision: 'The host did not report a revision for this access; reload before revoking.',
  failed: 'The action failed.',
  teams: 'Teams',
  noTeams: 'No teams yet. Create one for this PC.',
  teamCreate: 'Create a team',
  teamName: 'Team name',
  create: 'Create',
  thisPc: 'This PC',
  enrollHost: 'Serve this team from this PC',
  enrollController: 'Enroll this PC as a controller',
  enrolled: 'Enrolled.',
  linkStart: 'Start link',
  linkStop: 'Stop link',
  linkState: 'Relay link',
  invite: 'Invite someone',
  inviteRole: 'Role',
  inviteCreate: 'Create invitation',
  inviteToken: 'Invitation token (shown once)',
  inviteOnce: 'Copy it now; the host does not keep it.',
  approve: 'Approve',
  deny: 'Deny',
  decided: 'Request decided.',
  roleObserver: 'Observer (read only)',
  roleModerator: 'Moderator',
  roleEditor: 'Automation editor',
  command: 'Controller test',
  commandOperation: 'Read operation',
  commandRun: 'Send through the relay',
  commandStatus: 'Status',
  commandNoResult: 'The host returned no result.',
};

const es: Strings = {
  requests: 'Solicitudes de acceso',
  noRequests: 'No hay solicitudes pendientes.',
  title: 'Control remoto',
  lede: 'Quién puede controlar este host desde otro dispositivo y qué puede hacer.',
  status: 'Estado',
  gateway: 'Gateway',
  cloud: 'Nube',
  gatewayNotIncluded: 'No incluido en esta versión',
  cloudSignedIn: 'Sesión iniciada en TikTools Cloud',
  cloudSignedOut: 'Sin sesión',
  cloudUnavailable: 'Estado de la nube no disponible',
  hostSection: 'Host de la nube',
  hostLabel: 'Identificador del host',
  hostPlaceholder: 'identificador del host',
  hostInvalid: 'Escribe el identificador del host en la nube (de 1 a 128 caracteres).',
  load: 'Cargar accesos y solicitudes',
  access: 'Accesos',
  noAccess: 'No hay accesos concedidos a este host.',
  revision: 'revisión',
  revoke: 'Revocar',
  confirmRevoke: 'Confirmar revocación',
  revoked: (label) => `Acceso revocado para ${label}.`,
  noRevision: 'El host no informó la revisión de este acceso; recarga antes de revocar.',
  failed: 'La acción falló.',
  teams: 'Equipos',
  noTeams: 'Aún no hay equipos. Crea uno para este PC.',
  teamCreate: 'Crear un equipo',
  teamName: 'Nombre del equipo',
  create: 'Crear',
  thisPc: 'Este PC',
  enrollHost: 'Servir este equipo desde este PC',
  enrollController: 'Enrolar este PC como controlador',
  enrolled: 'Enrolado.',
  linkStart: 'Iniciar enlace',
  linkStop: 'Detener enlace',
  linkState: 'Enlace con el relay',
  invite: 'Invitar a alguien',
  inviteRole: 'Rol',
  inviteCreate: 'Crear invitación',
  inviteToken: 'Token de invitación (se muestra una vez)',
  inviteOnce: 'Cópialo ahora; el host no lo guarda.',
  approve: 'Aprobar',
  deny: 'Rechazar',
  decided: 'Solicitud resuelta.',
  roleObserver: 'Observador (solo lectura)',
  roleModerator: 'Moderador',
  roleEditor: 'Editor de automatizaciones',
  command: 'Prueba de controlador',
  commandOperation: 'Operación de lectura',
  commandRun: 'Enviar por el relay',
  commandStatus: 'Estado',
  commandNoResult: 'El host no devolvió resultado.',
};

/** Spanish for Spanish hosts; English for everything else, as the rest of the app does. */
export function stringsFor(locale: string): Strings {
  return locale.toLowerCase().startsWith('es') ? es : en;
}
