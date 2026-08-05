import { techCardApprovalStateOptions, techCardStageOptions } from 'constants/filter';

export const ZERO_TIMESTAMP = '0001-01-01T00:00:00Z';

const stageLabels: Record<string, string> = Object.fromEntries(
  techCardStageOptions.map((o) => [o.value, o.label]),
);
const approvalStateLabels: Record<string, string> = Object.fromEntries(
  techCardApprovalStateOptions.map((o) => [o.value, o.label]),
);

export function stageLabel(stage?: string): string {
  if (!stage || stage === 'TECH_CARD_STAGE_UNKNOWN') return '—';
  return stageLabels[stage] ?? '—';
}

export function approvalStateLabel(state?: string): string {
  if (!state || state === 'TECH_CARD_APPROVAL_STATE_UNKNOWN') return '—';
  return approvalStateLabels[state] ?? '—';
}

// The ONE server sentence this admin re-phrases, because it names an action by a name only this UI
// knows («re-open to draft»). Matched on the full clause on purpose: there is a second, different
// released message — "tech card is released and frozen; re-releasing it is how a frozen card
// reprices" (apisrv/admin/techcard_reprice.go:41) — and re-writing THAT one into "re-open it to
// Draft before editing" would send the operator the opposite way from what it is telling them.
const RELEASED_SENTINEL = 'tech card is released and frozen; re-open to draft';
// api.ts's own fallback when the error body carried no message ("Error: 400 - Bad Request"):
// a status line, not a reason, so it must not be shown as one.
const STATUS_LINE = /^Error: \d{3} - /;

// Maps a failed TechCard request to a role-readable message. The API layer attaches the HTTP status
// and the backend message.
//
// There is NO 412 here, and that is not an oversight: the admin gateway is a plain
// runtime.NewServeMux with no custom error handler (internal/api/http/http.go, adminJSONGateway), so
// grpc-gateway v2's default HTTPStatusFromCode applies — and it maps FailedPrecondition to **400**,
// not 412. Every tech-card precondition (released-and-frozen, the four-arm purpose lock) therefore
// lands in the same branch as real field validation. A `case 412` here was dead code that silently
// swallowed the purpose lock's text: the one actionable part of that error is the reference list the
// store appends ("1 live colourway linked to it (archive them first…)"), so the rule below is "the
// server's own sentence wins" — this admin only substitutes copy when the server said nothing at all.
export function techCardErrorMessage(error: unknown, fallback: string): string {
  const status = (error as { status?: number })?.status;
  const raw = error instanceof Error ? error.message : '';
  switch (status) {
    case 409:
      return 'This tech card was saved by someone else. Reload to get the latest version, then re-apply your changes.';
    // 412 kept alongside 400 purely as a belt-and-braces: if the gateway ever installs a custom
    // status mapper, a precondition arriving as 412 must not fall through to the bare message.
    case 412:
    case 400: {
      const msg = raw.trim();
      if (!msg || STATUS_LINE.test(msg)) return 'Validation failed — check the highlighted fields.';
      if (msg.toLowerCase().startsWith(RELEASED_SENTINEL))
        return 'This tech card is released and frozen. Re-open it to Draft before editing.';
      return msg;
    }
    default:
      return raw || fallback;
  }
}

// Renders a stored timestamp as YYYY-MM-DD, or '—' for the zero/unset value.
export function formatTechCardDate(timestamp?: string): string {
  if (!timestamp || timestamp === ZERO_TIMESTAMP) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString().slice(0, 10);
}
