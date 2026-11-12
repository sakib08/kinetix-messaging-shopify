import { useState } from "react";
import { ChannelSharePanel, CodeSnippet, InfoBox, Input, Row, SectionDivider, Select, StatusBadge, TabBar, Textarea, Toggle } from "./shared.jsx";
import { TOKEN } from "./tokens.js";
import api, { webhookUrl } from "../../api/client.js";

function stripMasked(values) {
  const out = { ...values };
  for (const key of Object.keys(out)) {
    if (typeof out[key] === "string" && /^•+$/.test(out[key])) delete out[key];
    if (key.endsWith("_set")) delete out[key];
  }
  return out;
}

export default function LineSettings({ cfg, setCfg }) {
  const [tab, setTab] = useState("channel");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const S = (key, value) => setCfg({ ...cfg, [key]: value });
  const color = TOKEN.line.color;

  const handleTest = async () => {
    if (testing) return;
    const token = String(cfg.accessToken || cfg.channelAccessToken || "").trim();
    const stored = (cfg.accessToken_set || cfg.channelAccessToken_set) && /^•+$/.test(token);
    if (!token || (/^•+$/.test(token) && !stored)) {
      setTestResult({ ok: false, message: "Enter a Channel Access Token first." });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      await api.saveChannel("line", stripMasked(cfg));
      const data = await api.testLine();
      const next = { ...cfg };
      if (data.basicId && !String(cfg.basicId || "").trim()) next.basicId = data.basicId;
      if (data.displayName && !String(cfg.accountName || "").trim()) next.accountName = data.displayName;
      setCfg(next);
      setTestResult({ ok: true, message: data.message || "Connected." });
    } catch (err) {
      setTestResult({ ok: false, message: err.message || "Connection failed." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${TOKEN.line.grad} flex items-center justify-center text-white font-black text-lg shadow-lg`}>L</div>
          <div>
            <h2 className="text-lg font-bold text-white">LINE Messaging API</h2>
            <p className="text-xs text-slate-400">Connect a LINE Official Account to your unified inbox</p>
          </div>
        </div>
        <StatusBadge connected={cfg.enabled} />
      </div>

      <ChannelSharePanel channel="line" cfg={cfg} color={color} />

      <TabBar
        tabs={[
          { id: "channel", label: "Channel" },
          { id: "webhook", label: "Webhook" },
          { id: "profile", label: "Profile" },
          { id: "messaging", label: "Messaging" },
        ]}
        active={tab}
        onChange={setTab}
        color={color}
      />

      {tab === "channel" && (
        <div className="space-y-4">
          <InfoBox type="info">Create a Messaging API channel in the LINE Developers Console, then copy the Channel ID, Channel Secret, and long-lived access token.</InfoBox>
          <Row label="Enable LINE" desc="Activate or pause the LINE integration.">
            <Toggle checked={cfg.enabled} onChange={value => S("enabled", value)} color={color} />
          </Row>
          <div className="grid grid-cols-2 gap-4 pt-1">
            <Input label="Channel ID" value={cfg.channelId} onChange={value => S("channelId", value)} placeholder="2000000000" mono />
            <Input label="Basic ID" value={cfg.basicId} onChange={value => S("basicId", value)} placeholder="@123abcde" />
            <div className="col-span-2">
              <Input label="Channel Secret" value={cfg.channelSecret} onChange={value => S("channelSecret", value)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" type="password" mono />
            </div>
            <div className="col-span-2">
              <Input label="Channel Access Token" value={cfg.accessToken} onChange={value => S("accessToken", value)} placeholder="Long-lived channel access token" type="password" helper="Keep this token on your server only." />
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={handleTest} disabled={testing} style={{ background: color }} className="px-5 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50">
              {testing ? "Verifying…" : "Verify LINE channel"}
            </button>
            {testResult && <span className={`text-xs font-medium ${testResult.ok ? "text-green-400" : "text-red-400"}`}>{testResult.message}</span>}
          </div>
        </div>
      )}

      {tab === "webhook" && (
        <div className="space-y-4">
          <InfoBox type="tip">Enable webhooks in the LINE Developers Console and set this endpoint as the Webhook URL.</InfoBox>
          <Input label="Webhook URL" value={webhookUrl("line")} readOnly mono />
          <SectionDivider label="Webhook Verification" />
          <CodeSnippet lang="http" code={`POST ${webhookUrl("line")}\nHeader: x-line-signature\nBody: LINE event payload`} />
          <SectionDivider label="Sample Message Event" />
          <CodeSnippet lang="json" code={`{\n  "events": [{\n    "type": "message",\n    "replyToken": "reply-token",\n    "source": { "type": "user", "userId": "Uxxxxxxxx" },\n    "message": { "type": "text", "text": "Hello, I need help" }\n  }]\n}`} />
        </div>
      )}

      {tab === "profile" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Official account name" value={cfg.accountName} onChange={value => S("accountName", value)} placeholder="Acme Support" />
            <Select label="Default language" value={cfg.language} onChange={value => S("language", value)} options={[
              { value: "en", label: "English" },
              { value: "ja", label: "Japanese" },
              { value: "th", label: "Thai" },
              { value: "id", label: "Indonesian" },
            ]} />
          </div>
          <Row label="Fetch user profiles" desc="Load LINE display names and avatars for inbound conversations.">
            <Toggle checked={cfg.fetchProfile} onChange={value => S("fetchProfile", value)} color={color} />
          </Row>
          <Row label="Create contacts automatically" desc="Create a customer record when an unknown LINE user messages you.">
            <Toggle checked={cfg.createContacts} onChange={value => S("createContacts", value)} color={color} />
          </Row>
        </div>
      )}

      {tab === "messaging" && (
        <div className="space-y-4">
          <Row label="Auto-assign conversations" desc="Distribute new LINE threads to available agents.">
            <Toggle checked={cfg.autoAssign} onChange={value => S("autoAssign", value)} color={color} />
          </Row>
          <Row label="Allow rich messages" desc="Enable image maps, buttons, carousel messages, and quick replies.">
            <Toggle checked={cfg.richMessages} onChange={value => S("richMessages", value)} color={color} />
          </Row>
          <Row label="Auto-reply on first message" desc="Send an immediate acknowledgement to new LINE contacts.">
            <Toggle checked={cfg.autoReply} onChange={value => S("autoReply", value)} color={color} />
          </Row>
          {cfg.autoReply && (
            <Textarea label="Auto-reply message" value={cfg.autoReplyMsg} onChange={value => S("autoReplyMsg", value)} rows={3} placeholder="Thanks for messaging us. Our team will reply shortly." />
          )}
        </div>
      )}
    </div>
  );
}
