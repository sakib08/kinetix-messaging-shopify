import { useState, useEffect, useCallback } from "react";
import { ChannelSharePanel, CodeSnippet, InfoBox, Input, Row, SectionDivider, Select, StatusBadge, TabBar, Textarea, Toggle } from "./shared.jsx";
import { TOKEN } from "./tokens.js";
import { webhookUrl, isLocalWebhookSite } from "../../api/client.js";
import api from "../../api/client.js";

function stripSecrets(values) {
  const out = { ...values };
  for (const key of Object.keys(out)) {
    if (typeof out[key] === "string" && /^•+$/.test(out[key])) {
      delete out[key];
    }
  }
  return out;
}

function randomWebhookSecret() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  }
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export default function TelegramSettings({ cfg, setCfg }) {
  const [tab, setTab] = useState("bot");
  const S = (k, v) => setCfg({ ...cfg, [k]: v });
  const color = TOKEN.telegram.color;

  const [webhookInfo, setWebhookInfo]       = useState(null);
  const [infoLoading, setInfoLoading]       = useState(false);
  const [registerBusy, setRegisterBusy]     = useState(false);
  const [registerResult, setRegisterResult] = useState(null); // { ok, message }

  const fetchWebhookInfo = useCallback(async () => {
    if (!cfg.botToken) return;
    setInfoLoading(true);
    try {
      const data = await api.getTelegramWebhookInfo();
      setWebhookInfo(data);
    } catch (err) {
      setWebhookInfo({ error: err.message || "Failed to fetch info" });
    } finally {
      setInfoLoading(false);
    }
  }, [cfg.botToken]);

  useEffect(() => {
    if (tab === "webhook") fetchWebhookInfo();
  }, [tab, fetchWebhookInfo]);

  const handleRegisterWebhook = async (dropPendingUpdates = false) => {
    if (!cfg.botToken?.trim()) {
      setRegisterResult({ ok: false, message: "Enter your bot token in Bot Setup first." });
      return;
    }
    setRegisterBusy(true);
    setRegisterResult(null);
    try {
      const secret = cfg.webhookSecret && !/^•+$/.test(cfg.webhookSecret)
        ? cfg.webhookSecret
        : randomWebhookSecret();
      if (secret !== cfg.webhookSecret) {
        S("webhookSecret", secret);
      }
      await api.saveChannel("telegram", stripSecrets({ ...cfg, webhookSecret: secret }));
      const data = await api.registerTelegramWebhook({ dropPendingUpdates });
      if (data.webhookSecret) {
        S("webhookSecret", data.webhookSecret);
      }
      setWebhookInfo(data.info || null);
      setRegisterResult({
        ok: true,
        message: dropPendingUpdates
          ? "Webhook registered and pending queue cleared ✓"
          : "Webhook registered successfully ✓",
      });
    } catch (err) {
      setRegisterResult({ ok: false, message: err.message || "Registration failed" });
    } finally {
      setRegisterBusy(false);
    }
  };
 
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${TOKEN.telegram.grad} flex items-center justify-center text-white font-black text-lg shadow-lg`}>T</div>
          <div>
            <h2 className="text-lg font-bold text-white">Telegram Bot</h2>
            <p className="text-xs text-slate-400">Connect a bot via BotFather and embed it on your site</p>
          </div>
        </div>
        <StatusBadge connected={cfg.enabled} />
      </div>

      <ChannelSharePanel channel="telegram" cfg={cfg} color={color} />

      <TabBar
        tabs={[{ id: "bot", label: "Bot Setup" }, { id: "webhook", label: "Webhook" }, { id: "widget", label: "Website Widget" }, { id: "features", label: "Features" }, { id: "advanced", label: "Advanced" }]}
        active={tab} onChange={setTab} color={color}
      />
 
      {tab === "bot" && (
        <div className="space-y-4">
          <InfoBox type="tip">
            Open Telegram → search <strong>@BotFather</strong> → type <code className="font-mono text-sky-300">/newbot</code> → follow the steps → copy the token below.
          </InfoBox>
          <Row label="Enable Telegram" desc="Activate or pause the Telegram integration.">
            <Toggle checked={cfg.enabled} onChange={v => S("enabled", v)} color={color} />
          </Row>
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="col-span-2">
              <Input label="Bot Token" value={cfg.botToken} onChange={v => S("botToken", v)} placeholder="123456789:ABCDEFxxxxxxxxxxxxxxxxxxxxxxx" type="password" mono helper="Keep secret. Anyone with this token can control your bot." />
            </div>
            <Input label="Bot username" value={cfg.botUsername} onChange={v => S("botUsername", v)} placeholder="@YourSupportBot" helper="The @handle you chose in BotFather." />
            <Input label="Bot display name" value={cfg.botName} onChange={v => S("botName", v)} placeholder="Acme Support" />
          </div>
          <SectionDivider label="BotFather Commands (run these in BotFather)" />
          <CodeSnippet lang="botfather" code={`/setdescription\nHelp & support for Acme Inc. Reply any time.\n\n/setabouttext\nPowered by Acme Support\n\n/setuserpic\n[Upload your brand logo]\n\n/setcommands\nstart - Start a conversation\nhelp - Get help\nstatus - Check your ticket status`} />
          <div className="flex gap-3">
            <button style={{ background: color }} className="px-5 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity">Verify bot token</button>
          </div>
        </div>
      )}
 
      {tab === "webhook" && (
        <div className="space-y-4">
          {isLocalWebhookSite && (
            <InfoBox type="warning">
              Your site URL is <strong>{webhookUrl("telegram")}</strong>. Telegram servers on the public internet cannot reach local or HTTP-only addresses like <code>.test</code> or <code>localhost</code>. That causes <em>Connection timed out</em> and pending updates.
              <br /><br />
              Use a public <strong>HTTPS</strong> URL (staging or production), or tunnel local dev with <strong>ngrok</strong> / Cloudflare Tunnel and set WordPress <em>Site URL</em> to that HTTPS address before registering the webhook.
            </InfoBox>
          )}
          <InfoBox type="info">
            Telegram delivers messages by calling your webhook URL. Click <strong>Register Webhook</strong> to save your Telegram settings, generate a webhook secret if needed, and point your bot at this site automatically.
          </InfoBox>

          {/* Webhook URL */}
          <Input label="Webhook URL (this site)" value={webhookUrl("telegram")} readOnly mono />
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input label="Webhook Secret" value={cfg.webhookSecret} onChange={v => S("webhookSecret", v)} placeholder="Auto-generated on register" type="password" helper="Validated on every inbound webhook. Leave blank to auto-generate when you register." />
            </div>
            <button
              type="button"
              onClick={() => S("webhookSecret", randomWebhookSecret())}
              className="mb-1 px-4 py-2 rounded-xl text-sm font-medium text-slate-300 border border-slate-700 hover:bg-slate-800 transition-colors shrink-0"
            >
              Generate
            </button>
          </div>

          {/* One-click register */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              style={{ background: color }}
              disabled={registerBusy || !cfg.botToken}
              onClick={() => handleRegisterWebhook(false)}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {registerBusy ? (
                <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Registering…</>
              ) : "Register Webhook"}
            </button>
            <button
              onClick={() => handleRegisterWebhook(true)}
              disabled={registerBusy || !cfg.botToken}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 border border-slate-700 hover:bg-slate-800 transition-colors disabled:opacity-50"
              title="Re-register and discard queued Telegram updates"
            >
              Clear pending queue
            </button>
            <button
              onClick={fetchWebhookInfo}
              disabled={infoLoading || !cfg.botToken}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 border border-slate-700 hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {infoLoading ? "Checking…" : "Check Status"}
            </button>
            {!cfg.botToken && (
              <span className="text-xs text-amber-400">Save your bot token first</span>
            )}
          </div>

          {/* Register result banner */}
          {registerResult && (
            <div className={`text-sm font-medium px-4 py-2 rounded-xl ${registerResult.ok ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
              {registerResult.message}
            </div>
          )}

          {/* Live webhook status card */}
          {webhookInfo && !webhookInfo.error && (
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Live Webhook Status</p>

              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${webhookInfo.registered && webhookInfo.urlMatch ? "bg-green-400" : webhookInfo.registered ? "bg-amber-400" : "bg-red-400"}`} />
                <span className={`text-sm font-semibold ${webhookInfo.registered && webhookInfo.urlMatch ? "text-green-400" : webhookInfo.registered ? "text-amber-400" : "text-red-400"}`}>
                  {!webhookInfo.registered
                    ? "Not registered — click Register Webhook"
                    : webhookInfo.urlMatch
                      ? "Active — pointing at this site ✓"
                      : "Registered but pointing at a different URL"}
                </span>
              </div>

              {webhookInfo.webhookUrl && (
                <p className="text-xs text-slate-400 font-mono break-all">
                  <span className="text-slate-600">Current URL: </span>{webhookInfo.webhookUrl}
                </p>
              )}

              <div className="flex flex-wrap gap-2 text-xs">
                <span className={`px-2 py-0.5 rounded-md border ${webhookInfo.hasWebhookSecret ? "border-green-500/30 text-green-400 bg-green-500/10" : "border-amber-500/30 text-amber-400 bg-amber-500/10"}`}>
                  {webhookInfo.hasWebhookSecret ? "Webhook secret saved" : "No webhook secret — click Register Webhook"}
                </span>
                <span className={`px-2 py-0.5 rounded-md border ${webhookInfo.channelEnabled ? "border-green-500/30 text-green-400 bg-green-500/10" : "border-slate-600 text-slate-400 bg-slate-800/60"}`}>
                  {webhookInfo.channelEnabled ? "Channel enabled" : "Channel disabled (updates accepted but ignored)"}
                </span>
              </div>

              {webhookInfo.pendingUpdateCount > 0 && (
                <p className="text-xs text-amber-400">
                  ⚠ {webhookInfo.pendingUpdateCount} pending update{webhookInfo.pendingUpdateCount !== 1 ? "s" : ""} queued by Telegram
                  {isLocalWebhookSite ? " — your site URL is not publicly reachable" : ""}
                </p>
              )}

              {webhookInfo.lastError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-400 mb-0.5">Last delivery error</p>
                  <p className="text-xs text-red-300">{webhookInfo.lastError}</p>
                  {webhookInfo.lastErrorAt && (
                    <p className="text-xs text-slate-500 mt-1">{new Date(webhookInfo.lastErrorAt * 1000).toLocaleString()}</p>
                  )}
                  {/401|403|unauthorized|forbidden/i.test(webhookInfo.lastError) && (
                    <p className="text-xs text-amber-300 mt-2">
                      Telegram was rejected by this site. Click <strong>Register Webhook</strong> again so the secret token matches, and ensure no security plugin blocks <code className="font-mono">/wp-json/kmbp/v1/webhooks/telegram</code>.
                    </p>
                  )}
                  {/timed out|timeout|connection refused|could not resolve/i.test(webhookInfo.lastError) && (
                    <p className="text-xs text-amber-300 mt-2">
                      Telegram cannot reach your server on port 443. Ask your hosting provider to allow inbound HTTPS from Telegram/datacenter IPs, or move the site to a host with better international routing.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {webhookInfo?.error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
              {webhookInfo.error}
            </div>
          )}

          <SectionDivider label="Manual cURL (alternative)" />
          <CodeSnippet lang="bash" code={`curl -X POST \\\n  https://api.telegram.org/bot${cfg.botToken||"<YOUR_BOT_TOKEN>"}/setWebhook \\\n  -d "url=${webhookUrl("telegram")}" \\\n  -d "secret_token=${cfg.webhookSecret||"<WEBHOOK_SECRET>"}" \\\n  -d "allowed_updates=[message,callback_query]"`} />

          <SectionDivider label="Sample Incoming Update" />
          <CodeSnippet lang="json" code={`{\n  "update_id": 123456789,\n  "message": {\n    "message_id": 1,\n    "from": { "id": 987654, "first_name": "Sarah" },\n    "chat": { "id": 987654, "type": "private" },\n    "text": "Hello! I need help."\n  }\n}`} />
        </div>
      )}
 
      {tab === "widget" && (
        <div className="space-y-4">
          <InfoBox type="tip">Add a Telegram button on your website or app so visitors can open a chat with your bot instantly.</InfoBox>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Pre-filled message (optional)" value={cfg.startMessage} onChange={v => S("startMessage", v)} placeholder="Hello, I need support!" helper="Sent automatically when user clicks the button." />
            <Select label="Button style" value={cfg.widgetStyle} onChange={v => S("widgetStyle", v)} options={[
              { value: "floating", label: "Floating bubble (bottom-right)" },
              { value: "inline", label: "Inline text link" },
              { value: "banner", label: "Banner bar" },
            ]} />
            <Input label="Button label" value={cfg.btnLabel} onChange={v => S("btnLabel", v)} placeholder="Chat on Telegram" />
            <Select label="Widget position" value={cfg.widgetPos} onChange={v => S("widgetPos", v)} options={[
              { value: "bottom-right", label: "Bottom right" },
              { value: "bottom-left", label: "Bottom left" },
            ]} />
          </div>
          <SectionDivider label="Deep Link" />
          <Input label="Share this link" value={`https://t.me/${(cfg.botUsername||"YourBot").replace("@","")}?start=${encodeURIComponent(cfg.startMessage||"start")}`} readOnly mono />
          <SectionDivider label="Embed Snippet — Floating Button" />
          <CodeSnippet lang="html" code={`<!-- Telegram floating chat button -->\n<style>\n  .tg-btn {\n    position: fixed; bottom: 24px; right: 24px; z-index: 9999;\n    background: #229ED9; color: #fff; border-radius: 50px;\n    padding: 12px 20px; font-family: sans-serif; font-size: 14px;\n    font-weight: 600; text-decoration: none;\n    box-shadow: 0 4px 16px rgba(34,158,217,.4);\n  }\n</style>\n<a class="tg-btn"\n   href="https://t.me/${(cfg.botUsername||"YourBot").replace("@","")}"\n   target="_blank">\n  💬 ${cfg.btnLabel||"Chat on Telegram"}\n</a>`} />
          <SectionDivider label="Login Widget (Authenticate users via Telegram)" />
          <CodeSnippet lang="html" code={`<script async src="https://telegram.org/js/telegram-widget.js?22"\n  data-telegram-login="${(cfg.botUsername||"YourBot").replace("@","")}"\n  data-size="large"\n  data-auth-url="https://yoursite.com/auth/telegram"\n  data-request-access="write">\n</script>`} />
        </div>
      )}
 
      {tab === "features" && (
        <div className="space-y-1">
          <Row label="Allow group conversations" desc="Handle messages from Telegram groups and supergroups.">
            <Toggle checked={cfg.allowGroups} onChange={v => S("allowGroups", v)} color={color} />
          </Row>
          <Row label="Typing indicator" desc="Send a typing action while agent composes a reply.">
            <Toggle checked={cfg.typingIndicator} onChange={v => S("typingIndicator", v)} color={color} />
          </Row>
          <Row label="Parse Markdown in replies" desc="Enable bold, italic, inline code, links in agent messages.">
            <Toggle checked={cfg.markdown} onChange={v => S("markdown", v)} color={color} />
          </Row>
          <Row label="Auto-reply on /start" desc="Send a welcome message when a user first starts the bot.">
            <Toggle checked={cfg.startReply} onChange={v => S("startReply", v)} color={color} />
          </Row>
          {cfg.startReply && (
            <div className="pt-2 pb-3">
              <Textarea label="Welcome message" value={cfg.startMsg} onChange={v => S("startMsg", v)} rows={3}
                placeholder={"👋 Hi there! Welcome to Acme Support.\n\nHow can we help you today?"} />
            </div>
          )}
          <Row label="Inline keyboards" desc="Use button grids in bot replies for structured options.">
            <Toggle checked={cfg.inlineKeyboard} onChange={v => S("inlineKeyboard", v)} color={color} />
          </Row>
          <Row label="Allow file uploads" desc="Accept files and documents sent by customers.">
            <Toggle checked={cfg.fileUpload} onChange={v => S("fileUpload", v)} color={color} />
          </Row>
          <Row label="Auto-assign new conversations" desc="Distribute to agents using round-robin.">
            <Toggle checked={cfg.autoAssign} onChange={v => S("autoAssign", v)} color={color} />
          </Row>
        </div>
      )}
 
      {tab === "advanced" && (
        <div className="space-y-4">
          <SectionDivider label="Commands" />
          <Textarea label="Bot command list (sent to BotFather via /setcommands)" value={cfg.commands} onChange={v => S("commands", v)} rows={6} mono
            placeholder={"start - Start a new conversation\nhelp - Get help and FAQs\nstatus - Check your ticket status\ncancel - Cancel current action"} />
          <SectionDivider label="Rate Limiting" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Max messages per second (global)" value={cfg.rateGlobal} onChange={v => S("rateGlobal", v)} placeholder="30" suffix="msg/s" />
            <Input label="Max messages per chat per second" value={cfg.ratePerChat} onChange={v => S("ratePerChat", v)} placeholder="1" suffix="msg/s" helper="Telegram enforces this limit." />
          </div>
          <SectionDivider label="Privacy & Data" />
          <Row label="Delete messages after conversation closed" desc="Remove message history from Telegram after resolution.">
            <Toggle checked={cfg.deleteClosed} onChange={v => S("deleteClosed", v)} color={color} />
          </Row>
          <Row label="Anonymise customer IDs in logs" desc="Replace Telegram user IDs with internal reference IDs in exported logs.">
            <Toggle checked={cfg.anonymise} onChange={v => S("anonymise", v)} color={color} />
          </Row>
        </div>
      )}
    </div>
  );
}
