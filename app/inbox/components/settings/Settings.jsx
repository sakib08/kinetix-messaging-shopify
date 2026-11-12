import { useEffect, useMemo, useState } from "react";
import EmailSettings from "./email.js";
import InstagramSettings from "./instagram.jsx";
import LineSettings from "./Line.jsx";
import MessengerSettings from "./messanger.jsx";
import SmsSettings from "./sms.jsx";
import TelegramSettings from "./telegram.jsx";
import ViberSettings from "./Viber.jsx";
import WeChatSettings from "./WeChat.jsx";
import WhatsAppSettings from "./whatsapp.jsx";
import LivechatSettings from "./livechat.jsx";
import AiSettings from "./Ai.jsx";
import AvailabilitySettings, { AVAILABILITY_DEFAULTS } from "./Availability.jsx";
import NotificationSettings, { NOTIFICATION_DEFAULTS } from "./Notifications.jsx";
import { ChannelCard, SettingsThemeContext } from "./shared.jsx";
import TeamSettings from "./Team.jsx";
import { TOKEN } from "./tokens.js";
import ThemeToggle from "../ThemeToggle.jsx";
import api, { caps } from "../../api/client.js";

const CHANNEL_DEFAULTS = {
  messenger: {
    enabled: false, pageId: "", pageName: "Acme Support", pageToken: "", appId: "", appSecret: "",
    verifyToken: "", chatPlugin: true, greetLoggedIn: "Hi {{user_first_name}}! How can we help?",
    greetLoggedOut: "Hi! How can we help today?", themeColor: "#0866FF", loggedOutMode: "window",
    allowedDomain: "", autoReply: true,
    autoReplyMsg: "Hi {{user_first_name}}! Thanks for messaging us. An agent will reply shortly.",
    awayMsg: true, awayMsgText: "We're offline right now but will respond first thing tomorrow.",
    iceBreakers: true, iceList: ["What are your business hours?", "Track my order", "Speak to a human"],
    persistentMenu: true, fetchProfile: true, readReceipts: true, typingIndicator: true,
    reactions: true, quickReplies: true, imageAttach: true, fileAttach: true, autoAssign: true,
    csat: false, handover: false, secondaryAppId: "",
  },
  livechat: {
    enabled: false, apiKey: "", host: "livechat.pluginpros.co",
    brandName: "", tagline: "We help your business grow by connecting you to your customers.",
    welcomeMessage: "Hi {{name}}, welcome! 👋",
    starterPrompt: "Please choose a starting sentence.",
    iceList: ["Just browsing!", "I'd like to learn more", "I have a question"],
    themeColor: "#7C3AED", position: "bottom-right", onlineText: "A few minutes",
    agentName: "", askName: true, phoneCountryCode: "", autoReply: true,
    autoReplyMsg: "Hi {{customer_name}}! Thanks for chatting with us. An agent will reply shortly.",
    autoAssign: true,
  },
  email: {
    enabled: false, inboxName: "Customer Support", inboxEmail: "", senderName: "", webhookToken: "",
    replyTo: "", smtpPreset: "gmail", smtpHost: "smtp.gmail.com", smtpPort: "587",
    smtpUser: "", smtpPass: "", smtpTls: true, smtpVerifySsl: true,
    imapHost: "imap.gmail.com", imapPort: "993", imapUser: "", imapPass: "",
    imapFolder: "INBOX", imapPoll: "2", imapDelete: false,
    autoReply: true, autoReplySubject: "We received your message — Ref #{{ticket_id}}",
    autoReplyBody: "", signature: true,
    signatureBody: "Best regards,\nThe Support Team", outOfOffice: false, oooBody: "",
  },
  whatsapp: {
    enabled: false, wabaid: "", phoneNumberId: "", accessToken: "", appSecret: "", verifyToken: "",
    displayPhone: "", ctaMessage: "Hello! I'd like to chat with support.", btnStyle: "floating",
    btnLabel: "Chat on WhatsApp", readReceipts: true, media: true, autoAssign: true,
    bizHours: false, autoReply: false, autoReplyMsg: "", template: "none",
    optOut: true, optIn: true, businessId: "", qualityTier: "MEDIUM",
  },
  telegram: {
    enabled: false, botToken: "", botUsername: "", botName: "", webhookSecret: "",
    startMessage: "Hello, I need support!", widgetStyle: "floating", btnLabel: "Chat on Telegram",
    widgetPos: "bottom-right", allowGroups: false, typingIndicator: true, markdown: true,
    startReply: true, startMsg: "Hi there! Welcome to support.\n\nHow can we help you today?",
    inlineKeyboard: true, fileUpload: true, autoAssign: true,
    commands: "start - Start a new conversation\nhelp - Get help and FAQs\nstatus - Check your ticket status",
    rateGlobal: "30", ratePerChat: "1", deleteClosed: false, anonymise: false,
  },
  sms: {
    enabled: false, provider: "twilio", accountSid: "", authToken: "", webhookToken: "",
    vonageKey: "", vonageSecret: "", genericKey: "", genericSecret: "",
    fromNumber: "", numberType: "local", perAgentNumber: false, mms: true,
    charWarn: true, autoSplit: true, unicode: false, delivery: true, retry: false,
    autoReply: true,
    autoReplyMsg: "Thanks for texting support. We received your message and will reply shortly. Reply STOP to opt out.",
    optOut: true, optIn: true, helpKeyword: false,
    helpMsg: "For support, call 1-800-000-0000 or email support@acme.com. Reply STOP to unsubscribe.",
    quietHours: false, quietFrom: "21:00", quietUntil: "09:00",
    brandId: "", campaignId: "", autoAssign: true, bizHours: false, sessionReset: false,
  },
  line: {
    enabled: false, channelId: "", basicId: "", channelSecret: "", accessToken: "",
    accountName: "", language: "en", fetchProfile: true, createContacts: true,
    autoAssign: true, richMessages: true, autoReply: true,
    autoReplyMsg: "Thanks for messaging us. Our team will reply shortly.",
  },
  viber: {
    enabled: false, botName: "", senderId: "", authToken: "", avatarUrl: "",
    region: "global", fetchProfile: true, smsFallback: false, deliveryReceipts: true,
    media: true, autoAssign: true,
    autoReplyMsg: "Thanks for contacting support. We will reply shortly.",
  },
  wechat: {
    enabled: false, appId: "", appSecret: "", accountType: "service", serverToken: "",
    encodingAesKey: "", fetchProfile: true, autoAssign: true, media: true,
    menuJson: '{"button":[{"type":"click","name":"Support","key":"SUPPORT"}]}',
    autoReplyMsg: "Thanks for contacting us on WeChat. We will reply shortly.",
  },
  instagram: {
    enabled: false, igAccountId: "", pageId: "", pageToken: "", appId: "", appSecret: "",
    verifyToken: "", fetchProfile: true, typingIndicator: true, readReceipts: true,
    imageAttach: true, storyReplies: true, autoAssign: true, csat: false,
    autoReply: true, autoReplyMsg: "Hi! Thanks for reaching out on Instagram 👋 An agent will reply shortly.",
    awayMsg: false, awayMsgText: "We're offline right now but will respond as soon as possible.",
    iceBreakers: false, iceList: ["What are your hours?", "Track my order", "Speak to a human"],
  },
};

const AI_DEFAULTS = {
  enabled: false,
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  chatModel: "gpt-4o-mini",
  embeddingModel: "text-embedding-3-small",
  assistantName: "AI Assistant",
  welcomeMsg:
    "Hi! I'm the AI assistant. How can I help you today? You can ask me a question or say \"talk to a human\" anytime.",
  waitForAgentMsg: "No problem — I'm connecting you with a human agent. Please wait a moment.",
  indexWpContent: true,
};

const CHANNEL_ORDER = Object.keys(CHANNEL_DEFAULTS);

// Strip masked secret placeholders ("••••••••") so they're not posted back to
// the server and overwrite the real stored secret.
function stripMaskedSecrets(values) {
  const out = { ...values };
  for (const key of Object.keys(out)) {
    if (typeof out[key] === "string" && /^•+$/.test(out[key])) {
      delete out[key];
    }
    if (key.endsWith("_set")) delete out[key];
  }
  return out;
}

export default function IntegrationSettings({ theme = "dark", toggleTheme }) {
  const [active, setActive] = useState("messenger");
  const [configs, setConfigs] = useState(() => ({
    ...Object.fromEntries(CHANNEL_ORDER.map((id) => [id, { ...CHANNEL_DEFAULTS[id] }])),
    ai: { ...AI_DEFAULTS },
    availability: { ...AVAILABILITY_DEFAULTS },
    notifications: { ...NOTIFICATION_DEFAULTS },
  }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getSettings()
      .then((remote) => {
        if (cancelled) return;
        setConfigs((previous) => {
          const next = { ...previous };
          for (const id of CHANNEL_ORDER) {
            next[id] = { ...CHANNEL_DEFAULTS[id], ...(remote?.[id] || {}) };
          }
          next.ai = { ...AI_DEFAULTS, ...(remote?.ai || {}) };
          next.availability = { ...AVAILABILITY_DEFAULTS, ...(remote?.availability || {}) };
          next.notifications = { ...NOTIFICATION_DEFAULTS, ...(remote?.notifications || {}) };
          return next;
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load settings");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const setChannel = (id) => (updater) => {
    setConfigs((previous) => {
      const current = previous[id];
      const next = typeof updater === "function" ? updater(current) : updater;
      return { ...previous, [id]: { ...current, ...next } };
    });
    setDirty(true);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = Object.fromEntries(
        CHANNEL_ORDER.map((id) => [id, stripMaskedSecrets(configs[id])])
      );
      payload.ai = stripMaskedSecrets(configs.ai || {});
      payload.availability = { ...(configs.availability || {}) };
      payload.notifications = { ...(configs.notifications || {}) };
      const remote = await api.saveSettings(payload);
      setConfigs((previous) => {
        const next = { ...previous };
        for (const id of CHANNEL_ORDER) {
          next[id] = { ...CHANNEL_DEFAULTS[id], ...(remote?.[id] || {}) };
        }
        next.ai = { ...AI_DEFAULTS, ...(remote?.ai || {}) };
        next.availability = { ...AVAILABILITY_DEFAULTS, ...(remote?.availability || {}) };
        next.notifications = { ...NOTIFICATION_DEFAULTS, ...(remote?.notifications || {}) };
        return next;
      });
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message || "Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  const channels = useMemo(() => [...CHANNEL_ORDER, "ai", "team"], []);
  const canManageSettings = caps?.canManageSettings || caps?.isAdmin;
  const showSaveButton = active !== "team" && canManageSettings;

  return (
    <div
      className="settings-page h-full text-slate-100 flex flex-col"
      style={{
        background:
          theme === "dark"
            ? "linear-gradient(135deg, #0a0e1a 0%, #0e1525 50%, #0a1020 100%)"
            : "linear-gradient(135deg, #f8fafc 0%, #eef2ff 52%, #f8fafc 100%)",
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      }}
    >
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-6 py-3 border-b border-slate-800/80 backdrop-blur-md"
        style={{ background: theme === "dark" ? "rgba(10,14,26,0.85)" : "rgba(255,255,255,0.86)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-black text-white">
            <i className="ti ti-settings" />
          </div>
          <span className="text-sm font-bold text-white tracking-tight">Integration Settings</span>
          <span className="text-xs text-slate-600 hidden sm:block">
            / {active === "team"
              ? "Team & Departments"
              : active === "ai"
              ? "AI Support"
              : active === "availability"
              ? "Availability"
              : active === "notifications"
              ? "Notifications"
              : "Channel Connections"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {loading && <span className="text-xs text-slate-400">Loading…</span>}
          {error && <span className="text-xs text-red-400 font-medium">{error}</span>}
          {dirty && !saved && !saving && <span className="text-xs text-amber-400 font-medium animate-pulse">Unsaved changes</span>}
          {saving && <span className="text-xs text-slate-300">Saving…</span>}
          {toggleTheme && <ThemeToggle theme={theme} onToggle={toggleTheme} />}
          {showSaveButton && (
            <button
              disabled={saving || loading || !dirty}
              onClick={handleSave}
              style={{ background: saved ? "#10B981" : "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saved ? "✓ Saved" : saving ? "Saving…" : "Save changes"}
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside
          className="w-60 shrink-0 border-r border-slate-800/60 flex flex-col py-4 px-3 gap-1 overflow-y-auto"
          style={{ background: theme === "dark" ? "rgba(8,12,22,0.6)" : "rgba(255,255,255,0.62)" }}
        >
          <p className="px-3 text-xs font-bold uppercase tracking-widest text-slate-600 mb-2">Channels</p>
          {CHANNEL_ORDER.map((id) => (
            <ChannelCard
              key={id}
              id={id}
              active={active === id}
              connected={!!configs[id]?.enabled}
              onClick={() => setActive(id)}
            />
          ))}

          <p className="px-3 mt-6 text-xs font-bold uppercase tracking-widest text-slate-600 mb-2">Intelligence</p>
          <button
            onClick={() => setActive("ai")}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-150 ${active === "ai" ? "bg-slate-800 shadow-md border border-slate-700/60" : "hover:bg-slate-800/50 border border-transparent"}`}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-indigo-500 to-violet-600 shrink-0">
              <i className="ti ti-robot" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className={`text-sm font-semibold truncate ${active === "ai" ? "text-gray-500" : "text-slate-300"}`}>AI Support</p>
              <p className="text-xs text-slate-500">{configs.ai?.enabled ? "Enabled" : "Disabled"}</p>
            </div>
          </button>

          <p className="px-3 mt-6 text-xs font-bold uppercase tracking-widest text-slate-600 mb-2">Team</p>
          <button
            onClick={() => setActive("team")}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-150 ${active === "team" ? "bg-slate-800 shadow-md border border-slate-700/60" : "hover:bg-slate-800/50 border border-transparent"}`}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-indigo-500 to-purple-600 shrink-0">
              <i className="ti ti-users" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className={`text-sm font-semibold truncate ${active === "team" ? "text-gray-500" : "text-slate-300"}`}>Agents & Departments</p>
              <p className="text-xs text-slate-500">Manage assignments</p>
            </div>
          </button>
          <button
            onClick={() => setActive("availability")}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-150 ${active === "availability" ? "bg-slate-800 shadow-md border border-slate-700/60" : "hover:bg-slate-800/50 border border-transparent"}`}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-emerald-500 to-teal-600 shrink-0">
              <i className="ti ti-clock" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className={`text-sm font-semibold truncate ${active === "availability" ? "text-gray-500" : "text-slate-300"}`}>Availability</p>
              <p className="text-xs text-slate-500">{configs.availability?.hoursEnabled ? "Business hours on" : "Always open"}</p>
            </div>
          </button>
          <button
            onClick={() => setActive("notifications")}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-150 ${active === "notifications" ? "bg-slate-800 shadow-md border border-slate-700/60" : "hover:bg-slate-800/50 border border-transparent"}`}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-amber-500 to-orange-600 shrink-0">
              <i className="ti ti-bell" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className={`text-sm font-semibold truncate ${active === "notifications" ? "text-gray-500" : "text-slate-300"}`}>Notifications</p>
              <p className="text-xs text-slate-500">
                {configs.notifications?.emailAssigned || configs.notifications?.emailWaiting ? "Email alerts on" : "Email alerts off"}
              </p>
            </div>
          </button>

          <div className="flex-1" />

          <div className="px-3 pt-4 border-t border-slate-800/60 mt-2 space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-2">Status</p>
            {CHANNEL_ORDER.map((id) => (
              <div key={id} className="flex items-center justify-between py-1">
                <span className="text-xs text-slate-400">{TOKEN[id].label}</span>
                <span className={`text-xs font-semibold ${configs[id]?.enabled ? "text-green-400" : "text-slate-600"}`}>
                  {configs[id]?.enabled ? "●" : "○"}
                </span>
              </div>
            ))}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8 pb-24">
          <SettingsThemeContext.Provider value={theme}>
            {active === "team" ? (
              <TeamSettings />
            ) : active === "ai" ? (
              <AiSettings cfg={configs.ai || AI_DEFAULTS} setCfg={setChannel("ai")} />
            ) : active === "availability" ? (
              <AvailabilitySettings cfg={configs.availability || AVAILABILITY_DEFAULTS} setCfg={setChannel("availability")} />
            ) : active === "notifications" ? (
              <NotificationSettings cfg={configs.notifications || NOTIFICATION_DEFAULTS} setCfg={setChannel("notifications")} />
            ) : (
              <>
                {active === "messenger" && (
                  <MessengerSettings cfg={configs.messenger} setCfg={setChannel("messenger")} />
                )}
                {active === "livechat" && (
                  <LivechatSettings cfg={configs.livechat} setCfg={setChannel("livechat")} />
                )}
                {active === "email" && (
                  <EmailSettings cfg={configs.email} setCfg={setChannel("email")} />
                )}
                {active === "whatsapp" && (
                  <WhatsAppSettings cfg={configs.whatsapp} setCfg={setChannel("whatsapp")} />
                )}
                {active === "telegram" && (
                  <TelegramSettings cfg={configs.telegram} setCfg={setChannel("telegram")} />
                )}
                {active === "sms" && (
                  <SmsSettings cfg={configs.sms} setCfg={setChannel("sms")} />
                )}
                {active === "line" && (
                  <LineSettings cfg={configs.line} setCfg={setChannel("line")} />
                )}
                {active === "viber" && (
                  <ViberSettings cfg={configs.viber} setCfg={setChannel("viber")} />
                )}
                {active === "wechat" && (
                  <WeChatSettings cfg={configs.wechat} setCfg={setChannel("wechat")} />
                )}
                {active === "instagram" && (
                  <InstagramSettings cfg={configs.instagram} setCfg={setChannel("instagram")} />
                )}
              </>
            )}
          </SettingsThemeContext.Provider>
          </div>
        </main>
      </div>
    </div>
  );
}
