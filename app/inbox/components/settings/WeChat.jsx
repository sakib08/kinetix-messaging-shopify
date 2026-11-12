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

export default function WeChatSettings({ cfg, setCfg }) {
  const [tab, setTab] = useState("account");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const S = (k, v) => setCfg({ ...cfg, [k]: v });
  const color = TOKEN.wechat.color;

  const handleTest = async () => {
    if (testing) return;
    const appId = String(cfg.appId || "").trim();
    const secret = String(cfg.appSecret || "").trim();
    const storedSecret = Boolean(cfg.appSecret_set) && /^•+$/.test(secret);
    if (!appId) {
      setTestResult({ ok: false, message: "Enter an App ID first." });
      return;
    }
    if (!secret || (/^•+$/.test(secret) && !storedSecret)) {
      setTestResult({ ok: false, message: "Enter an App Secret first." });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      await api.saveChannel("wechat", stripMasked(cfg));
      const data = await api.testWeChat();
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
          <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${TOKEN.wechat.grad} flex items-center justify-center text-white font-black text-lg shadow-lg`}>W</div>
          <div>
            <h2 className="text-lg font-bold text-white">WeChat Official Account</h2>
            <p className="text-xs text-slate-400">Connect your WeChat Official Account to the unified inbox</p>
          </div>
        </div>
        <StatusBadge connected={cfg.enabled} />
      </div>

      <ChannelSharePanel channel="wechat" cfg={cfg} color={color} />

      <TabBar
        tabs={[
          { id: "account", label: "Account" },
          { id: "webhook", label: "Webhook" },
          { id: "menu", label: "Custom Menu" },
          { id: "messaging", label: "Messaging" },
        ]}
        active={tab}
        onChange={setTab}
        color={color}
      />

      {tab === "account" && (
        <div className="space-y-4">
          <InfoBox type="info">
            Register a WeChat Official Account at <strong>mp.weixin.qq.com</strong>, then create a developer app in the WeChat Open Platform to obtain your App ID and App Secret.
          </InfoBox>
          <Row label="Enable WeChat" desc="Activate or pause the WeChat integration.">
            <Toggle checked={cfg.enabled} onChange={v => S("enabled", v)} color={color} />
          </Row>
          <div className="grid grid-cols-2 gap-4 pt-1">
            <Input label="App ID" value={cfg.appId} onChange={v => S("appId", v)} placeholder="wx1234567890abcdef" mono helper="Found in WeChat Open Platform → your app → Development settings." />
            <Select label="Account type" value={cfg.accountType} onChange={v => S("accountType", v)} options={[
              { value: "service", label: "Service account" },
              { value: "subscription", label: "Subscription account" },
            ]} helper="Service accounts support more API features for customer support." />
            <div className="col-span-2">
              <Input label="App Secret" value={cfg.appSecret} onChange={v => S("appSecret", v)} placeholder="••••••••••••••••••••••••••••••••" type="password" helper="Keep this secret. Use it only on your backend server." />
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={handleTest} disabled={testing} style={{ background: color }} className="px-5 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50">
              {testing ? "Testing…" : "Test connection"}
            </button>
            {testResult && <span className={`text-xs font-medium ${testResult.ok ? "text-green-400" : "text-red-400"}`}>{testResult.message}</span>}
          </div>
        </div>
      )}

      {tab === "webhook" && (
        <div className="space-y-4">
          <InfoBox type="tip">
            In the WeChat Official Account admin → Development → Basic configuration, set the server URL and paste the Token and EncodingAESKey below. Enable message encryption mode if you use AES.
          </InfoBox>
          <Input label="Server URL — paste in WeChat admin → Basic configuration" value={webhookUrl("wechat")} readOnly mono helper="WeChat will POST inbound messages and events to this URL." />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Server Token" value={cfg.serverToken} onChange={v => S("serverToken", v)} placeholder="your_server_token" helper="Any secret string you choose. Used to verify webhook requests." />
            <Input label="EncodingAESKey" value={cfg.encodingAesKey} onChange={v => S("encodingAesKey", v)} placeholder="43-character encoding key" mono helper="Required when message encryption is enabled (43 characters)." />
          </div>
          <SectionDivider label="URL Verification" />
          <CodeSnippet lang="http" code={`GET ${webhookUrl("wechat")}\n  ?signature=<sha1>\n  &timestamp=<timestamp>\n  &nonce=<nonce>\n  &echostr=<echostr>\n\n# Your server validates the signature using the Server Token,\n# then returns echostr to complete verification.`} />
          <SectionDivider label="Sample Inbound Message (XML)" />
          <CodeSnippet lang="xml" code={`<xml>\n  <ToUserName><![CDATA[gh_xxxxxxxx]]></ToUserName>\n  <FromUserName><![CDATA[oXXXXXXXX]]></FromUserName>\n  <CreateTime>1234567890</CreateTime>\n  <MsgType><![CDATA[text]]></MsgType>\n  <Content><![CDATA[Hello, I need support]]></Content>\n  <MsgId>1234567890123456</MsgId>\n</xml>`} />
        </div>
      )}

      {tab === "menu" && (
        <div className="space-y-4">
          <InfoBox type="tip">
            Define a custom menu for your Official Account. Publish via the WeChat API or paste JSON below and sync from your backend.
          </InfoBox>
          <Textarea
            label="Custom menu JSON"
            value={cfg.menuJson}
            onChange={v => S("menuJson", v)}
            rows={8}
            mono
            helper='Example: {"button":[{"type":"click","name":"Support","key":"SUPPORT"}]}'
          />
          <SectionDivider label="Publish Menu — API call" />
          <CodeSnippet lang="bash" code={`curl -X POST \\\n  "https://api.weixin.qq.com/cgi-bin/menu/create?access_token=<ACCESS_TOKEN>" \\\n  -H "Content-Type: application/json" \\\n  -d '${cfg.menuJson || '{"button":[]}'}`} />
        </div>
      )}

      {tab === "messaging" && (
        <div className="space-y-4">
          <SectionDivider label="Conversation Behaviour" />
          <Row label="Fetch user profiles" desc="Load WeChat nickname and avatar for inbound conversations.">
            <Toggle checked={cfg.fetchProfile} onChange={v => S("fetchProfile", v)} color={color} />
          </Row>
          <Row label="Auto-assign conversations" desc="Route new WeChat messages to available agents.">
            <Toggle checked={cfg.autoAssign} onChange={v => S("autoAssign", v)} color={color} />
          </Row>
          <Row label="Allow media attachments" desc="Accept images, voice, video, and file messages when supported.">
            <Toggle checked={cfg.media} onChange={v => S("media", v)} color={color} />
          </Row>
          <SectionDivider label="Auto-Reply" />
          <Textarea
            label="Auto-reply message"
            value={cfg.autoReplyMsg}
            onChange={v => S("autoReplyMsg", v)}
            rows={3}
            placeholder="Thanks for contacting us on WeChat. We will reply shortly."
            helper="Sent when a customer messages outside agent hours or on first contact, if configured on your backend."
          />
        </div>
      )}
    </div>
  );
}
