import { Toggle, SectionDivider, Row, InfoBox, Select } from "./shared.jsx";

const COLOR = "#f59e0b";

export const NOTIFICATION_DEFAULTS = {
  emailAssigned: true,
  emailAssignedOfflineOnly: true,
  emailWaiting: false,
  waitingMinutes: 15,
};

const WAITING_OPTIONS = [5, 10, 15, 30, 60].map((m) => ({ value: String(m), label: `${m} minutes` }));

export default function NotificationSettings({ cfg, setCfg }) {
  const S = (key, value) => setCfg({ [key]: value });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white">Notifications</h2>
        <p className="text-xs text-slate-500 mt-1">Make sure new conversations reach an agent, even when nobody is watching the inbox.</p>
      </div>

      <InfoBox type="info">
        <strong>Browser notifications</strong> (pop-ups, a sound, and an unread count in the tab title) are set by each
        agent on their own browser, from the bell icon in the inbox sidebar. They work while the inbox is open in a tab.
      </InfoBox>

      <SectionDivider label="Email alerts" />

      <Row label="Email agents when a conversation is assigned to them" desc="Sent when someone else or the AI assigns the conversation. Assigning a chat to yourself never sends an email.">
        <Toggle checked={!!cfg.emailAssigned} onChange={(v) => S("emailAssigned", v)} color={COLOR} />
      </Row>

      {cfg.emailAssigned && (
        <Row label="Only if the agent is offline or away" desc="Agents who are online already get a browser notification, so skip the email.">
          <Toggle checked={!!cfg.emailAssignedOfflineOnly} onChange={(v) => S("emailAssignedOfflineOnly", v)} color={COLOR} />
        </Row>
      )}

      <Row
        label="Email when a customer is left waiting"
        desc="If the newest message in an open conversation is from the customer and nobody has replied, email the assigned agent. Unassigned conversations go to the department's agents, or to all agents if there is no department. One email per unanswered message."
      >
        <Toggle checked={!!cfg.emailWaiting} onChange={(v) => S("emailWaiting", v)} color={COLOR} />
      </Row>

      {cfg.emailWaiting && (
        <Select
          label="Send the reminder after"
          value={String(cfg.waitingMinutes || 15)}
          onChange={(v) => S("waitingMinutes", Number(v))}
          options={WAITING_OPTIONS}
          helper="Checked every 5 minutes by WP-Cron, so a reminder can arrive up to 5 minutes later than this."
        />
      )}

      <InfoBox type="tip">
        Emails are sent with WordPress&apos;s own mail function to each agent&apos;s account email. If your site doesn&apos;t
        send email reliably, install an SMTP plugin.
      </InfoBox>
    </div>
  );
}
