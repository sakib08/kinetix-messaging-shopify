import { useState } from "react";
import { ChannelSharePanel, CodeSnippet, InfoBox, Input, Row, SectionDivider, Select, StatusBadge, TabBar, Textarea, Toggle } from "./shared.jsx";
import { TOKEN } from "./tokens.js";
import api, { webhookUrl } from "../../api/client.js";

function stripMasked(values) {
  const out = { ...values };
  for (const key of Object.keys(out)) {
    if (typeof out[key] === "string" && /^•+$/.test(out[key])) {
      delete out[key];
    }
    if (key.endsWith("_set")) delete out[key];
  }
  return out;
}

export default function MessengerSettings({ cfg, setCfg }) {
  const [tab, setTab] = useState("api");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const S = (k, v) => setCfg({ ...cfg, [k]: v });
  const color = TOKEN.messenger.color;

  const handleVerify = async () => {
    if (verifying) return;
    const token = String(cfg.pageToken || "").trim();
    const storedToken = Boolean(cfg.pageToken_set) && /^•+$/.test(token);
    if (!token || (/^•+$/.test(token) && !storedToken)) {
      setVerifyResult({ ok: false, message: "Enter a Page Access Token first." });
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      await api.saveChannel("messenger", stripMasked(cfg));
      const data = await api.testMessenger();
      const next = { ...cfg };
      if (data.pageId && !String(cfg.pageId || "").trim()) next.pageId = data.pageId;
      if (data.pageName && (!String(cfg.pageName || "").trim() || cfg.pageName === "Acme Support")) {
        next.pageName = data.pageName;
      }
      setCfg(next);
      setVerifyResult({ ok: true, message: data.message || "Connected." });
    } catch (err) {
      setVerifyResult({ ok: false, message: err.message || "Connection failed." });
    } finally {
      setVerifying(false);
    }
  };
 
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${TOKEN.messenger.grad} flex items-center justify-center text-white font-black text-lg shadow-lg`}>M</div>
          <div>
            <h2 className="text-lg font-bold text-white">Facebook Messenger</h2>
            <p className="text-xs text-slate-400">Receive & reply to Messenger DMs in your inbox</p>
          </div>
        </div>
        <StatusBadge connected={cfg.enabled} />
      </div>

      <ChannelSharePanel channel="messenger" cfg={cfg} color={color} />

      <TabBar
        tabs={[{ id: "api", label: "API Keys" }, { id: "webhook", label: "Webhook" }, { id: "widget", label: "Chat Plugin" }, { id: "automation", label: "Automation" }, { id: "advanced", label: "Advanced" }]}
        active={tab} onChange={setTab} color={color}
      />
 
      {/* API */}
      {tab === "api" && (
        <div className="space-y-4">
          <InfoBox type="info">
            Connect a Facebook Page via Meta for Developers. Your app needs <strong>pages_messaging</strong>, <strong>pages_read_engagement</strong>, and <strong>pages_manage_metadata</strong> permissions.
          </InfoBox>
          <Row label="Enable Messenger" desc="Activate or pause the Messenger integration.">
            <Toggle checked={cfg.enabled} onChange={v => S("enabled", v)} color={color} />
          </Row>
          <div className="grid grid-cols-2 gap-4 pt-1">
            <Input label="Facebook Page ID" value={cfg.pageId} onChange={v => S("pageId", v)} placeholder="123456789012345" mono helper="Found under Page → About → Page Transparency." />
            <Input label="Page Name" value={cfg.pageName} onChange={v => S("pageName", v)} placeholder="Acme Support" />
            <div className="col-span-2">
              <Input label="Page Access Token" value={cfg.pageToken} onChange={v => S("pageToken", v)} placeholder="EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx..." type="password" helper="Generate in Meta for Developers → Graph API Explorer." />
            </div>
            <Input label="Meta App ID" value={cfg.appId} onChange={v => S("appId", v)} placeholder="1234567890" mono />
            <Input label="App Secret" value={cfg.appSecret} onChange={v => S("appSecret", v)} placeholder="••••••••••••••••••••••" type="password" helper="Used to verify webhook signatures." />
          </div>
          <div className="flex items-center gap-3 pt-2 flex-wrap">
            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying}
              style={{ background: color }}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {verifying ? "Verifying…" : "Verify Connection"}
            </button>
            {verifyResult && (
              <span className={`text-xs font-medium ${verifyResult.ok ? "text-green-400" : "text-red-400"}`}>
                {verifyResult.message}
              </span>
            )}
            <button className="px-5 py-2 rounded-xl text-sm font-semibold text-slate-300 border border-slate-700 hover:bg-slate-800 transition-colors">
              Clear credentials
            </button>
          </div>
        </div>
      )}
 
      {/* Webhook */}
      {tab === "webhook" && (
        <div className="space-y-4">
          <InfoBox type="tip">
            Paste the Callback URL and Verify Token into <strong>Meta for Developers → App → Webhooks → Page</strong>. Subscribe to: <code className="font-mono">messages, messaging_postbacks, messaging_optins, message_deliveries</code>
          </InfoBox>
          <Input label="Callback URL — paste into Meta Webhooks" value={webhookUrl("messenger")} readOnly mono helper="Meta will POST all Messenger events to this endpoint." />
          <Input label="Verify Token — paste into Meta Webhooks" value={cfg.verifyToken} onChange={v => S("verifyToken", v)} placeholder="your_custom_verify_token_here" helper="Any secret string. Must match exactly what you enter in Meta." />
          <SectionDivider label="Required Webhook Subscriptions" />
          <CodeSnippet lang="subscriptions" code={"messages\nmessaging_postbacks\nmessaging_optins\nmessage_deliveries\nmessage_reads"} />
          <SectionDivider label="Sample Payload" />
          <CodeSnippet lang="json" code={`{\n  "object": "page",\n  "entry": [{\n    "id": "${cfg.pageId || "PAGE_ID"}",\n    "messaging": [{\n      "sender": { "id": "USER_PSID" },\n      "message": { "text": "Hello!" }\n    }]\n  }]\n}`} />
        </div>
      )}
 
      {/* Chat Plugin */}
      {tab === "widget" && (
        <div className="space-y-4">
          <Row label="Enable Customer Chat Plugin" desc="Embed Messenger chat widget on your website.">
            <Toggle checked={cfg.chatPlugin} onChange={v => S("chatPlugin", v)} color={color} />
          </Row>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Greeting — logged-in users" value={cfg.greetLoggedIn} onChange={v => S("greetLoggedIn", v)} placeholder="Hi {{user_first_name}}! How can we help?" helper="Shown to visitors with active Facebook sessions." />
            <Input label="Greeting — logged-out users" value={cfg.greetLoggedOut} onChange={v => S("greetLoggedOut", v)} placeholder="Hi there! How can we help?" />
            <Input label="Theme color (hex)" value={cfg.themeColor} onChange={v => S("themeColor", v)} placeholder="#0866FF" />
            <Select label="Logged-out chat mode" value={cfg.loggedOutMode} onChange={v => S("loggedOutMode", v)} options={[{ value: "window", label: "Open in new window" }, { value: "inline", label: "Inline" }, { value: "hide", label: "Hide for logged-out" }]} />
            <div className="col-span-2">
              <Input label="Allowed domain" value={cfg.allowedDomain} onChange={v => S("allowedDomain", v)} placeholder="https://www.yourwebsite.com" helper="Only this domain may load the chat plugin. Must include https://" />
            </div>
          </div>
          <SectionDivider label="Embed Snippet" />
          <CodeSnippet lang="html" code={`<!-- Add before </body> -->\n<div id="fb-root"></div>\n<script async defer\n  crossorigin="anonymous"\n  src="https://connect.facebook.net/en_US/sdk/xfbml.customerchat.js">\n</script>\n<fb:customerchat\n  attribution="setup_tool"\n  page_id="${cfg.pageId || "YOUR_PAGE_ID"}"\n  theme_color="${cfg.themeColor || "#0866FF"}">\n</fb:customerchat>`} />
        </div>
      )}
 
      {/* Automation */}
      {tab === "automation" && (
        <div className="space-y-5">
          <SectionDivider label="Auto-Reply" />
          <Row label="Send auto-reply on new thread" desc="Instantly acknowledge a customer when they open a new Messenger conversation.">
            <Toggle checked={cfg.autoReply} onChange={v => S("autoReply", v)} color={color} />
          </Row>
          {cfg.autoReply && (
            <Textarea label="Auto-reply message" value={cfg.autoReplyMsg} onChange={v => S("autoReplyMsg", v)} rows={3}
              placeholder={"Hi {{user_first_name}}! Thanks for messaging us 👋 An agent will reply shortly."} helper="Tokens: {{user_first_name}}, {{page_name}}, {{agent_name}}" />
          )}
          <Row label="Away message (outside business hours)" desc="Sent when no agents are online.">
            <Toggle checked={cfg.awayMsg} onChange={v => S("awayMsg", v)} color={color} />
          </Row>
          {cfg.awayMsg && (
            <Textarea value={cfg.awayMsgText} onChange={v => S("awayMsgText", v)} rows={2} placeholder={"We're offline right now but will respond first thing tomorrow ☀️"} />
          )}
          <SectionDivider label="Ice Breakers" />
          <Row label="Enable ice breakers" desc="Show quick-start question buttons when a user opens the conversation for the first time.">
            <Toggle checked={cfg.iceBreakers} onChange={v => S("iceBreakers", v)} color={color} />
          </Row>
          {cfg.iceBreakers && (
            <div className="space-y-2 pl-1">
              {(cfg.iceList || []).map((item, i) => (
                <div key={i} className="flex gap-2">
                  <div className="flex-1">
                    <Input value={item} onChange={v => { const l = [...(cfg.iceList||[])]; l[i] = v; S("iceList", l); }} placeholder={`Question ${i + 1}`} />
                  </div>
                  <button onClick={() => S("iceList", (cfg.iceList||[]).filter((_, j) => j !== i))} className="self-center text-slate-600 hover:text-red-400 transition-colors px-2">✕</button>
                </div>
              ))}
              {(cfg.iceList?.length || 0) < 4 && (
                <button onClick={() => S("iceList", [...(cfg.iceList||[]), ""])} className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">+ Add question</button>
              )}
            </div>
          )}
          <SectionDivider label="Persistent Menu" />
          <Row label="Enable persistent menu" desc="A hamburger menu always visible in the Messenger compose bar.">
            <Toggle checked={cfg.persistentMenu} onChange={v => S("persistentMenu", v)} color={color} />
          </Row>
        </div>
      )}
 
      {/* Advanced */}
      {tab === "advanced" && (
        <div className="space-y-1">
          <Row label="Fetch user profile (name & avatar)" desc="Pull customer name and profile picture from Facebook.">
            <Toggle checked={cfg.fetchProfile} onChange={v => S("fetchProfile", v)} color={color} />
          </Row>
          <Row label="Read receipts" desc="Show agents when messages have been seen by the customer.">
            <Toggle checked={cfg.readReceipts} onChange={v => S("readReceipts", v)} color={color} />
          </Row>
          <Row label="Typing indicator" desc="Show a typing bubble to the customer while an agent types.">
            <Toggle checked={cfg.typingIndicator} onChange={v => S("typingIndicator", v)} color={color} />
          </Row>
          <Row label="Message reactions" desc="Allow agents to react to messages with emoji.">
            <Toggle checked={cfg.reactions} onChange={v => S("reactions", v)} color={color} />
          </Row>
          <Row label="Quick reply buttons" desc="Add structured reply buttons for faster customer responses.">
            <Toggle checked={cfg.quickReplies} onChange={v => S("quickReplies", v)} color={color} />
          </Row>
          <Row label="Allow image attachments" desc="Accept and send images via Messenger.">
            <Toggle checked={cfg.imageAttach} onChange={v => S("imageAttach", v)} color={color} />
          </Row>
          <Row label="Allow file attachments" desc="Accept PDFs, documents, and other files.">
            <Toggle checked={cfg.fileAttach} onChange={v => S("fileAttach", v)} color={color} />
          </Row>
          <Row label="Auto-assign new conversations" desc="Round-robin assignment to available agents.">
            <Toggle checked={cfg.autoAssign} onChange={v => S("autoAssign", v)} color={color} />
          </Row>
          <Row label="CSAT survey on conversation close" desc="Send a thumbs-up/down satisfaction rating request.">
            <Toggle checked={cfg.csat} onChange={v => S("csat", v)} color={color} />
          </Row>
          <div className="pt-3">
            <SectionDivider label="Handover Protocol" />
            <Row label="Enable Handover Protocol" desc="Pass thread control between your inbox and a Meta bot.">
              <Toggle checked={cfg.handover} onChange={v => S("handover", v)} color={color} />
            </Row>
            {cfg.handover && (
              <div className="pt-2">
                <Input label="Secondary Receiver App ID" value={cfg.secondaryAppId} onChange={v => S("secondaryAppId", v)} placeholder="Meta App ID of the secondary receiver" mono />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   EMAIL SETTINGS
═══════════════════════════════════════════════════════════════════════════ */
