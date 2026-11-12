import { Input, Textarea, Toggle, SectionDivider, Row, InfoBox } from "./shared.jsx";
import { siteTimezone } from "../../api/client.js";

const COLOR = "#10b981";

const DAYS = [
  { id: "mon", label: "Monday" },
  { id: "tue", label: "Tuesday" },
  { id: "wed", label: "Wednesday" },
  { id: "thu", label: "Thursday" },
  { id: "fri", label: "Friday" },
  { id: "sat", label: "Saturday" },
  { id: "sun", label: "Sunday" },
];

export const AVAILABILITY_DEFAULTS = {
  hoursEnabled: false,
  requireOnlineAgent: true,
  offlineMsgEnabled: false,
  offlineMsg:
    "Thanks for your message! Our team is away right now. Our hours are {{hours}}. We'll reply as soon as we're back.",
  ...Object.fromEntries(
    DAYS.flatMap(({ id }) => [
      [`${id}Open`, id !== "sat" && id !== "sun"],
      [`${id}Start`, "09:00"],
      [`${id}End`, "17:00"],
    ])
  ),
};

function TimeInput({ value, onChange, disabled }) {
  return (
    <input
      type="time"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-700 bg-slate-800/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-indigo-500 disabled:opacity-40"
    />
  );
}

export default function AvailabilitySettings({ cfg, setCfg }) {
  const S = (key, value) => setCfg({ [key]: value });

  const copyMondayToWeekdays = () => {
    const next = {};
    for (const { id } of DAYS.slice(1, 5)) {
      next[`${id}Open`] = cfg.monOpen;
      next[`${id}Start`] = cfg.monStart;
      next[`${id}End`] = cfg.monEnd;
    }
    setCfg(next);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white">Availability</h2>
        <p className="text-xs text-slate-500 mt-1">
          Control when your team counts as available. AI routing and the offline notice use these rules.
        </p>
      </div>

      <InfoBox type="info">
        Agents set themselves <strong>Online</strong> or <strong>Away</strong> from the avatar at the bottom of the inbox
        sidebar. An Online agent counts as available while the inbox or any wp-admin page is open; after about 3 minutes
        without activity they count as offline. New chats are only auto-assigned to agents who are online.
      </InfoBox>

      <SectionDivider label="Business hours" />

      <Row label="Use business hours" desc={`Outside these hours the team counts as offline. Times use your Shopify store timezone (${siteTimezone}).`}>
        <Toggle checked={!!cfg.hoursEnabled} onChange={(v) => S("hoursEnabled", v)} color={COLOR} />
      </Row>

      {cfg.hoursEnabled && (
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 divide-y divide-slate-800/70">
          {DAYS.map(({ id, label }) => {
            const open = !!cfg[`${id}Open`];
            return (
              <div key={id} className="flex items-center gap-4 px-4 py-2.5">
                <Toggle checked={open} onChange={(v) => S(`${id}Open`, v)} color={COLOR} />
                <span className={`w-28 text-sm ${open ? "text-slate-200" : "text-slate-500"}`}>{label}</span>
                {open ? (
                  <div className="flex items-center gap-2">
                    <TimeInput value={cfg[`${id}Start`]} onChange={(v) => S(`${id}Start`, v)} />
                    <span className="text-slate-500 text-xs">to</span>
                    <TimeInput value={cfg[`${id}End`]} onChange={(v) => S(`${id}End`, v)} />
                    {cfg[`${id}Start`] === cfg[`${id}End`] && <span className="text-xs text-slate-500">24 hours</span>}
                    {cfg[`${id}Start`] > cfg[`${id}End`] && <span className="text-xs text-slate-500">ends next day</span>}
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">Closed</span>
                )}
              </div>
            );
          })}
          <div className="px-4 py-2.5">
            <button
              type="button"
              onClick={copyMondayToWeekdays}
              className="text-xs text-indigo-300 hover:text-indigo-200"
            >
              Copy Monday to Tuesday–Friday
            </button>
          </div>
        </div>
      )}

      <Row
        label="Treat the team as offline when no agent is online"
        desc="Even inside business hours, send the offline notice and let the AI answer if nobody is set to Online."
      >
        <Toggle checked={!!cfg.requireOnlineAgent} onChange={(v) => S("requireOnlineAgent", v)} color={COLOR} />
      </Row>

      <SectionDivider label="Offline notice" />

      <Row
        label="Send an offline notice"
        desc="Replies once per conversation (at most every 12 hours) when a customer writes while the team is offline. Replaces the channel's &quot;an agent will reply shortly&quot; auto-reply while offline. When AI Support is on, the AI replies instead."
      >
        <Toggle checked={!!cfg.offlineMsgEnabled} onChange={(v) => S("offlineMsgEnabled", v)} color={COLOR} />
      </Row>

      {cfg.offlineMsgEnabled && (
        <Textarea
          label="Offline message"
          value={cfg.offlineMsg}
          onChange={(v) => S("offlineMsg", v)}
          rows={3}
          helper="Placeholders: {{hours}} (your schedule), {{next_open}} (e.g. “tomorrow at 9:00 am”), {{customer_name}}."
        />
      )}

      {!cfg.hoursEnabled && !cfg.requireOnlineAgent && cfg.offlineMsgEnabled && (
        <InfoBox type="warning">
          With business hours off and &quot;no agent online&quot; off, the team never counts as offline, so the notice will never be sent.
        </InfoBox>
      )}

      <Input label="Store timezone" value={siteTimezone} readOnly helper="Taken from your Shopify store settings." />
    </div>
  );
}
