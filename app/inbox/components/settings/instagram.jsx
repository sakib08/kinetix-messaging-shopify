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

export default function InstagramSettings({ cfg, setCfg }) {
  const [tab, setTab] = useState("api");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const S = (k, v) => setCfg({ ...cfg, [k]: v });
  const color = TOKEN.instagram.color;

  const handleTest = async () => {
    if (testing) return;
    const token = String(cfg.pageToken || "").trim();
    const stored = Boolean(cfg.pageToken_set) && /^•+$/.test(token);
    if (!token || (/^•+$/.test(token) && !stored)) {
      setTestResult({ ok: false, message: "Enter a Page Access Token first." });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      await api.saveChannel("instagram", stripMasked(cfg));
      const data = await api.testInstagram();
      const next = { ...cfg };
      if (data.pageId && !String(cfg.pageId || "").trim()) next.pageId = data.pageId;
      if (data.igAccountId && !String(cfg.igAccountId || "").trim()) next.igAccountId = data.igAccountId;
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${TOKEN.instagram.grad} flex items-center justify-center text-white font-black text-lg shadow-lg`}
          >
            <i className="ti ti-brand-instagram" style={{ fontSize: 20 }} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Instagram DM</h2>
            <p className="text-xs text-slate-400">Receive and reply to Instagram Direct Messages in your inbox</p>
          </div>
        </div>
        <StatusBadge connected={cfg.enabled} />
      </div>

      <ChannelSharePanel channel="instagram" cfg={cfg} color={color} />

      <TabBar
        tabs={[
          { id: "api",        label: "API Keys"   },
          { id: "webhook",    label: "Webhook"    },
          { id: "automation", label: "Automation" },
          { id: "advanced",   label: "Advanced"   },
        ]}
        active={tab}
        onChange={setTab}
        color={color}
      />

      {/* ── API Keys ───────────────────────────────────────────────────── */}
      {tab === "api" && (
        <div className="space-y-4">
          <InfoBox type="info">
            Instagram DM uses the <strong>Meta Messaging API</strong>. You need an Instagram Professional Account connected to a Facebook Page, and a Meta App with <strong>instagram_manage_messages</strong> and <strong>instagram_basic</strong> permissions approved.
          </InfoBox>

          <Row label="Enable Instagram DM" desc="Activate or pause the Instagram integration.">
            <Toggle checked={cfg.enabled} onChange={v => S("enabled", v)} color={color} />
          </Row>

          <div className="grid grid-cols-2 gap-4 pt-1">
            <Input
              label="Instagram Account ID"
              value={cfg.igAccountId}
              onChange={v => S("igAccountId", v)}
              placeholder="17841400000000000"
              mono
              helper="Found in Instagram → Settings → Account → About this account → Instagram ID."
            />
            <Input
              label="Connected Facebook Page ID"
              value={cfg.pageId}
              onChange={v => S("pageId", v)}
              placeholder="123456789012345"
              mono
              helper="The Page linked to your Instagram Professional Account."
            />
            <div className="col-span-2">
              <Input
                label="Page Access Token"
                value={cfg.pageToken}
                onChange={v => S("pageToken", v)}
                placeholder="EAAxxxxxxxxxxxxxxxxxxxxxxx…"
                type="password"
                helper="Generate a System User token with instagram_manage_messages scope in Meta Business Settings."
              />
            </div>
            <Input
              label="Meta App ID"
              value={cfg.appId}
              onChange={v => S("appId", v)}
              placeholder="1234567890"
              mono
            />
            <Input
              label="App Secret"
              value={cfg.appSecret}
              onChange={v => S("appSecret", v)}
              placeholder="••••••••••••••••••••••"
              type="password"
              helper="Used to verify X-Hub-Signature-256 on inbound webhooks."
            />
            <Input
              label="Webhook Verify Token"
              value={cfg.verifyToken}
              onChange={v => S("verifyToken", v)}
              placeholder="your_custom_verify_token"
              helper="Any secret string. Must match exactly what you enter in Meta Webhooks."
            />
          </div>

          <div className="flex items-center gap-3 pt-2 flex-wrap">
            <button type="button" onClick={handleTest} disabled={testing} style={{ background: color }} className="px-5 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50">
              {testing ? "Verifying…" : "Verify connection"}
            </button>
            {testResult && <span className={`text-xs font-medium ${testResult.ok ? "text-green-400" : "text-red-400"}`}>{testResult.message}</span>}
          </div>
        </div>
      )}

      {/* ── Webhook ─────────────────────────────────────────────────────── */}
      {tab === "webhook" && (
        <div className="space-y-4">
          <InfoBox type="tip">
            In Meta for Developers → App → Instagram → Webhooks, subscribe to the <strong>messages</strong> and <strong>messaging_postbacks</strong> fields. Paste the Callback URL and Verify Token below.
          </InfoBox>

          <Input
            label="Callback URL — paste into Meta Instagram Webhooks"
            value={webhookUrl("instagram")}
            readOnly
            mono
            helper="Meta will POST all Instagram DM events to this URL."
          />
          <Input
            label="Verify Token — paste into Meta Instagram Webhooks"
            value={cfg.verifyToken}
            onChange={v => S("verifyToken", v)}
            placeholder="your_custom_verify_token_here"
            helper="Must match the Verify Token you entered in the API Keys tab."
          />

          <SectionDivider label="Required Webhook Subscriptions" />
          <CodeSnippet
            lang="subscriptions"
            code={"messages\nmessaging_postbacks\nmessaging_seen\nstandby"}
          />

          <SectionDivider label="Sample Inbound DM Payload" />
          <CodeSnippet
            lang="json"
            code={`{\n  "object": "instagram",\n  "entry": [{\n    "id": "${cfg.igAccountId || "IG_ACCOUNT_ID"}",\n    "messaging": [{\n      "sender":    { "id": "USER_IGSID" },\n      "recipient": { "id": "${cfg.igAccountId || "IG_ACCOUNT_ID"}" },\n      "timestamp": 1234567890000,\n      "message":   { "mid": "m_xxxxx", "text": "Hi, I need help!" }\n    }]\n  }]\n}`}
          />

          <SectionDivider label="Permissions Required (review in Meta App Review)" />
          <CodeSnippet
            lang="permissions"
            code={"instagram_manage_messages\ninstagram_basic\npages_messaging\npages_read_engagement\npages_manage_metadata"}
          />
        </div>
      )}

      {/* ── Automation ──────────────────────────────────────────────────── */}
      {tab === "automation" && (
        <div className="space-y-5">
          <SectionDivider label="Auto-Reply" />
          <Row label="Send auto-reply on new DM" desc="Instantly acknowledge a customer when they open a new conversation.">
            <Toggle checked={cfg.autoReply} onChange={v => S("autoReply", v)} color={color} />
          </Row>
          {cfg.autoReply && (
            <Textarea
              label="Auto-reply message"
              value={cfg.autoReplyMsg}
              onChange={v => S("autoReplyMsg", v)}
              rows={3}
              placeholder="Hi! Thanks for reaching out on Instagram 👋 An agent will reply shortly."
              helper="Tokens: {{customer_name}}, {{ticket_id}}"
            />
          )}

          <Row label="Away message (outside business hours)" desc="Sent when no agents are online.">
            <Toggle checked={cfg.awayMsg} onChange={v => S("awayMsg", v)} color={color} />
          </Row>
          {cfg.awayMsg && (
            <Textarea
              value={cfg.awayMsgText}
              onChange={v => S("awayMsgText", v)}
              rows={2}
              placeholder="We're offline right now but will respond as soon as possible ☀️"
            />
          )}

          <SectionDivider label="Ice Breakers" />
          <Row label="Enable ice breakers" desc="Show quick-start question buttons in new conversations.">
            <Toggle checked={cfg.iceBreakers} onChange={v => S("iceBreakers", v)} color={color} />
          </Row>
          {cfg.iceBreakers && (
            <div className="space-y-2 pl-1">
              {(cfg.iceList || []).map((item, i) => (
                <div key={i} className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      value={item}
                      onChange={v => { const l = [...(cfg.iceList || [])]; l[i] = v; S("iceList", l); }}
                      placeholder={`Question ${i + 1}`}
                    />
                  </div>
                  <button
                    onClick={() => S("iceList", (cfg.iceList || []).filter((_, j) => j !== i))}
                    className="self-center text-slate-600 hover:text-red-400 transition-colors px-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {(cfg.iceList?.length || 0) < 4 && (
                <button
                  onClick={() => S("iceList", [...(cfg.iceList || []), ""])}
                  className="text-xs font-semibold text-pink-400 hover:text-pink-300 transition-colors flex items-center gap-1"
                >
                  + Add question
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Advanced ────────────────────────────────────────────────────── */}
      {tab === "advanced" && (
        <div className="space-y-1">
          <Row label="Fetch customer profile" desc="Load the Instagram username from the API for new conversations.">
            <Toggle checked={cfg.fetchProfile} onChange={v => S("fetchProfile", v)} color={color} />
          </Row>
          <Row label="Typing indicator" desc="Send a typing bubble to the customer while an agent types.">
            <Toggle checked={cfg.typingIndicator} onChange={v => S("typingIndicator", v)} color={color} />
          </Row>
          <Row label="Read receipts" desc="Mark messages as seen when an agent opens the conversation.">
            <Toggle checked={cfg.readReceipts} onChange={v => S("readReceipts", v)} color={color} />
          </Row>
          <Row label="Allow image attachments" desc="Accept and send images via Instagram DM.">
            <Toggle checked={cfg.imageAttach} onChange={v => S("imageAttach", v)} color={color} />
          </Row>
          <Row label="Allow story replies" desc="Receive customer replies to your Instagram Stories as DMs.">
            <Toggle checked={cfg.storyReplies} onChange={v => S("storyReplies", v)} color={color} />
          </Row>
          <Row label="Auto-assign new conversations" desc="Round-robin assignment to available agents.">
            <Toggle checked={cfg.autoAssign} onChange={v => S("autoAssign", v)} color={color} />
          </Row>
          <Row label="CSAT survey on conversation close" desc="Send a thumbs-up/down satisfaction survey to customers.">
            <Toggle checked={cfg.csat} onChange={v => S("csat", v)} color={color} />
          </Row>

          <SectionDivider label="Note" />
          <InfoBox type="warning">
            Instagram DM API requires your app to pass Meta App Review before it can receive messages from customers who haven't previously messaged your account. Test with accounts that have Instagram Business/Creator profiles during development.
          </InfoBox>
        </div>
      )}
    </div>
  );
}
