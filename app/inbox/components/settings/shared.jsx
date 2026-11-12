import { createContext, useContext, useState } from "react";
import { TOKEN } from "./tokens.js";

/** Consumed by ChannelSharePanel to adapt colours without prop-drilling. */
export const SettingsThemeContext = createContext("dark");

/** Build the channel's direct contact URL from stored settings. */
function getChannelDirectLink(channel, cfg) {
  switch (channel) {
    case "telegram": {
      const username = (cfg.botUsername || "").replace(/^@/, "");
      return username ? `https://t.me/${username}` : "";
    }
    case "whatsapp": {
      const phone = (cfg.displayPhone || "").replace(/\D/g, "");
      const text  = encodeURIComponent(cfg.ctaMessage || "Hello!");
      return phone ? `https://wa.me/${phone}?text=${text}` : "";
    }
    case "messenger":
      return cfg.pageId ? `https://m.me/${cfg.pageId}` : "";
    case "instagram":
      return cfg.igAccountId ? `https://ig.me/m/${cfg.igAccountId}` : "";
    case "line": {
      const basicId = (cfg.basicId || "").replace(/^@/, "");
      return basicId ? `https://line.me/R/ti/p/${basicId}` : "";
    }
    case "viber":
      return cfg.senderId ? `viber://pa?chatURI=${cfg.senderId}` : "";
    case "wechat":
      return ""; // QR-code based; no universal deep-link
    case "sms": {
      const num = (cfg.fromNumber || "").replace(/\D/g, "");
      return num ? `sms:+${num}` : "";
    }
    case "email":
      return cfg.inboxEmail ? `mailto:${cfg.inboxEmail}` : "";
    case "livechat":
      return "";
    default:
      return "";
  }
}
 
/* ─── tiny primitives ───────────────────────────────────────────────────── */
export function Toggle({ checked, onChange, color = "#6366f1" }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{ background: checked ? color : "#d1d5db" }}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none"
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${checked ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}
 
export function Input({ label, value, onChange, placeholder, type = "text", readOnly, mono, helper, prefix, suffix }) {
  const [show, setShow] = useState(false);
  const isPass = type === "password";
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</label>}
      <div className={`flex items-center rounded-xl border transition-all duration-150 ${readOnly ? "border-slate-700/60 bg-slate-800/40" : "border-slate-700 bg-slate-800/70 hover:border-slate-500 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20"}`}>
        {prefix && <span className="px-3 py-2.5 text-xs text-slate-500 border-r border-slate-700 select-none font-mono">{prefix}</span>}
        <input
          type={isPass && !show ? "password" : "text"}
          value={value}
          onChange={e => !readOnly && onChange?.(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          className={`flex-1 bg-transparent px-3 py-2.5 text-sm outline-none ${readOnly ? "text-slate-400 select-all cursor-default" : "text-slate-100 placeholder-slate-600"} ${mono ? "font-mono" : ""}`}
        />
        {isPass && (
          <button onClick={() => setShow(s => !s)} className="px-3 text-slate-500 hover:text-slate-300 transition-colors">
            {show ? "🙈" : "👁"}
          </button>
        )}
        {readOnly && (
          <button
            onClick={() => navigator.clipboard?.writeText(value)}
            className="px-3 text-slate-500 hover:text-indigo-400 transition-colors text-xs font-medium"
          >copy</button>
        )}
        {suffix && <span className="px-3 text-xs text-slate-500 font-mono">{suffix}</span>}
      </div>
      {helper && <p className="text-xs text-slate-500 leading-relaxed">{helper}</p>}
    </div>
  );
}
 
export function Select({ label, value, onChange, options, helper }) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2.5 text-sm text-slate-100 outline-none hover:border-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
      >
        {options.map(o => <option key={o.value} value={o.value} className="bg-slate-800">{o.label}</option>)}
      </select>
      {helper && <p className="text-xs text-slate-500 leading-relaxed">{helper}</p>}
    </div>
  );
}
 
export function Textarea({ label, value, onChange, placeholder, rows = 3, helper, mono }) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</label>}
      <textarea
        rows={rows}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none resize-none hover:border-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all leading-relaxed ${mono ? "font-mono" : ""}`}
      />
      {helper && <p className="text-xs text-slate-500 leading-relaxed">{helper}</p>}
    </div>
  );
}
 
export function SectionDivider({ label }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 h-px bg-slate-700/60" />
      <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</span>
      <div className="flex-1 h-px bg-slate-700/60" />
    </div>
  );
}
 
export function Row({ label, desc, children }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3.5 border-b border-slate-800/80 last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-200">{label}</p>
        {desc && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}
 
export function InfoBox({ children, type = "info" }) {
  const styles = {
    info:    "border-blue-500/30 bg-blue-500/8 text-blue-300",
    warning: "border-amber-500/30 bg-amber-500/8 text-amber-300",
    success: "border-green-500/30 bg-green-500/8 text-green-300",
    tip:     "border-indigo-500/30 bg-indigo-500/8 text-indigo-300",
  };
  const icons = { info: "ℹ", warning: "⚠", success: "✓", tip: "💡" };
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 text-xs leading-relaxed ${styles[type]}`}>
      <span className="shrink-0 mt-0.5">{icons[type]}</span>
      <span>{children}</span>
    </div>
  );
}
 
export function CodeSnippet({ code, lang = "html" }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl overflow-hidden border border-slate-700/60">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-700/60">
        <span className="text-xs font-mono text-slate-500">{lang}</span>
        <button
          onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className={`text-xs font-medium transition-colors ${copied ? "text-green-400" : "text-slate-400 hover:text-white"}`}
        >
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>
      <pre className="px-4 py-3 bg-slate-950/80 text-xs text-emerald-400 font-mono leading-relaxed overflow-x-auto whitespace-pre">{code}</pre>
    </div>
  );
}
 
export function StatusBadge({ connected }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${connected ? "bg-green-500/15 text-green-400 border border-green-500/25" : "bg-slate-700/50 text-slate-400 border border-slate-600/40"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-slate-500"}`} />
      {connected ? "Connected" : "Not connected"}
    </span>
  );
}
 
export function TabBar({ tabs, active, onChange, color }) {
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-slate-900/60 border border-slate-800">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={active === t.id ? { background: color + "18", color } : {}}
          className={`flex-1 text-xs font-semibold py-2 px-3 rounded-lg transition-all duration-150 ${active === t.id ? "shadow-sm" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/60"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export { TOKEN };

/* ─── channel share & embed panel ───────────────────────────────────────── */
const EMBED_TABS = [
  { id: "shortcode", label: "Shortcode" },
  { id: "gutenberg", label: "Gutenberg" },
  { id: "elementor", label: "Elementor" },
];

export function ChannelSharePanel({ channel, cfg, color }) {
  const theme    = useContext(SettingsThemeContext);
  const isDark   = theme !== "light";

  const [open, setOpen]         = useState(false);
  const [embedTab, setEmbedTab] = useState("shortcode");

  const directLink   = getChannelDirectLink(channel, cfg);
  const shortcode    = `[kmbp_channel_button channel="${channel}"]`;
  const gbBlock      = `<!-- wp:shortcode -->\n${shortcode}\n<!-- /wp:shortcode -->`;
  const channelLabel = TOKEN[channel]?.label ?? channel;

  // Theme-adaptive class sets
  const wrap       = isDark ? "border-slate-700/60 bg-slate-900/40"      : "border-slate-200 bg-white/90 shadow-sm";
  const hoverBtn   = isDark ? "hover:bg-slate-800/40"                    : "hover:bg-slate-50";
  const iconCls    = isDark ? "text-slate-400 group-hover:text-slate-200" : "text-slate-500 group-hover:text-slate-700";
  const chevronCls = isDark ? "text-slate-500"                           : "text-slate-400";
  const separator  = isDark ? "border-slate-800/60"                      : "border-slate-100";
  const tabBar     = isDark ? "bg-slate-800/60"                          : "bg-slate-100";
  const tabInactive = isDark
    ? "text-slate-500 hover:text-slate-300 hover:bg-slate-700/40"
    : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/60";
  const bodyText   = isDark ? "text-slate-400"  : "text-slate-600";
  const strongText = isDark ? "text-slate-300"  : "text-slate-800";
  const muteText   = isDark ? "text-slate-500"  : "text-slate-500";
  const setupBadge = isDark
    ? "bg-slate-700/60 text-slate-500 border-slate-600/40"
    : "bg-slate-100 text-slate-500 border-slate-300/60";

  return (
    <div className={`rounded-xl border overflow-hidden ${wrap}`}>
      {/* ── Toggle header ── */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-3 transition-colors group ${hoverBtn}`}
      >
        <div className="flex items-center gap-2.5">
          <i className={`ti ti-share transition-colors ${iconCls}`} style={{ fontSize: 15 }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color }}>
            Share &amp; Embed
          </span>
          {directLink ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-600 border border-green-500/25 font-medium">
              Link ready
            </span>
          ) : (
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${setupBadge}`}>
              Setup required
            </span>
          )}
        </div>
        <i className={`ti ${open ? "ti-chevron-up" : "ti-chevron-down"} transition-transform ${chevronCls}`} style={{ fontSize: 14 }} />
      </button>

      {/* ── Expanded body ── */}
      {open && (
        <div className={`px-4 pb-4 pt-1 space-y-3 border-t ${separator}`}>

          {/* Direct link row */}
          <div className="pt-2">
            {directLink ? (
              <Input label="Channel direct link — share or use in your CTA" value={directLink} readOnly mono />
            ) : channel === "livechat" ? (
              <InfoBox type="info">
                Live Chat does not use a shareable deep-link. Enable the channel and save — the widget appears automatically on every public page of this site.
              </InfoBox>
            ) : channel === "wechat" ? (
              <InfoBox type="info">
                WeChat does not support universal deep-links. Share your Official Account QR code instead — download it from the WeChat Official Account platform.
              </InfoBox>
            ) : (
              <InfoBox type="warning">
                Complete the channel credentials above and save to generate a shareable link.
              </InfoBox>
            )}
          </div>

          {channel !== "livechat" && (
          <>
          <SectionDivider label="Embed on your site" />

          {/* Embed tab switcher */}
          <div className={`flex gap-1 rounded-lg p-1 ${tabBar}`}>
            {EMBED_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setEmbedTab(t.id)}
                style={embedTab === t.id ? { background: color + "22", color } : {}}
                className={`flex-1 text-xs font-semibold py-1.5 px-2 rounded-md transition-all duration-150 ${
                  embedTab === t.id ? "" : tabInactive
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Shortcode tab */}
          {embedTab === "shortcode" && (
            <div className="space-y-2">
              <p className={`text-xs leading-relaxed ${bodyText}`}>
                Paste into any <strong className={strongText}>Shortcode</strong> block, text widget, or PHP template.
              </p>
              <CodeSnippet lang="shortcode — default button" code={shortcode} />
              <CodeSnippet lang="shortcode — custom label" code={`[kmbp_channel_button channel="${channel}" label="Contact us on ${channelLabel}"]`} />
              <CodeSnippet lang="shortcode — plain link style" code={`[kmbp_channel_button channel="${channel}" style="link"]`} />
            </div>
          )}

          {/* Gutenberg tab */}
          {embedTab === "gutenberg" && (
            <div className="space-y-2">
              <InfoBox type="tip">
                In the block editor click <strong>+</strong> → search <em>Shortcode</em> → add the block → paste the code below.
              </InfoBox>
              <CodeSnippet lang="block (HTML view)" code={gbBlock} />
              <p className={`text-xs leading-relaxed ${muteText}`}>
                You can also switch to <strong className={strongText}>Code Editor</strong> (⋮ menu → Code editor) and paste directly.
              </p>
            </div>
          )}

          {/* Elementor tab */}
          {embedTab === "elementor" && (
            <div className="space-y-2">
              <InfoBox type="tip">
                In Elementor editor search for the <strong>Shortcode</strong> widget → drag it onto your page → paste the code below into the <em>Shortcode</em> field.
              </InfoBox>
              <CodeSnippet lang="shortcode" code={shortcode} />
              <p className={`text-xs leading-relaxed ${muteText}`}>
                Works with <strong className={strongText}>Elementor Free</strong> and <strong className={strongText}>Elementor Pro</strong>. No coding required.
              </p>
            </div>
          )}
          </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── channel cards (sidebar) ───────────────────────────────────────────── */
export function ChannelCard({ id, active, connected, onClick }) {
  const t = TOKEN[id];
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-150 group ${active ? "bg-slate-800 shadow-md border border-slate-700/60" : "hover:bg-slate-800/50 border border-transparent"}`}
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black text-white shadow-sm bg-gradient-to-br ${t.grad} shrink-0`}
      >
        {t.icon}
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className={`text-sm font-semibold truncate ${active ? "text-gray-500" : "text-slate-300"}`}>{t.label}</p>
        <p className="text-xs text-slate-500">{connected ? "● Connected" : "○ Disconnected"}</p>
      </div>
      {active && <div className="w-1 h-8 rounded-full" style={{ background: t.color }} />}
    </button>
  );
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   MESSENGER SETTINGS
═══════════════════════════════════════════════════════════════════════════ */
