// Browser notifications for the inbox: per-browser preferences, permission,
// a short chime, and desktop pop-ups for new customer messages.

const PREFS_KEY = "kmbp_notify_prefs";
const DEFAULT_PREFS = { desktop: true, sound: true };

export const notificationsSupported = () =>
  typeof window !== "undefined" && "Notification" in window && window.isSecureContext;

/** "granted" | "denied" | "default" | "unsupported" */
export const notificationPermission = () =>
  notificationsSupported() ? window.Notification.permission : "unsupported";

export function getNotifyPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(window.localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveNotifyPrefs(prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or storage full: preferences just won't persist.
  }
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return "unsupported";
  try {
    return await window.Notification.requestPermission();
  } catch {
    return window.Notification.permission;
  }
}

// ── Sound ────────────────────────────────────────────────────────────────────
// Browsers only allow audio after a user gesture, so the context is created on
// the first click and reused later, including while the tab is in the background.
let audioCtx = null;

function unlockAudio() {
  if (audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audioCtx = new Ctx();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
}

if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", unlockAudio, { once: true });
  document.addEventListener("keydown", unlockAudio, { once: true });
}

export function playChime() {
  if (!audioCtx) return;
  try {
    const start = audioCtx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const t = start + i * 0.15;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  } catch {
    // Ignore audio failures; the pop-up still shows.
  }
}

// ── Pop-ups ──────────────────────────────────────────────────────────────────
const CHANNEL_LABELS = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  telegram: "Telegram",
  line: "LINE",
  viber: "Viber",
  wechat: "WeChat",
  sms: "SMS",
  email: "Email",
  livechat: "Live Chat",
};

export function showMessageNotification(item, onClick) {
  if (notificationPermission() !== "granted") return;
  try {
    const channel = CHANNEL_LABELS[item.channel] || item.channel;
    const n = new window.Notification(`${item.contactName || "Customer"} · ${channel}`, {
      body: item.preview || "New message",
      tag: `kmbp-conv-${item.conversationId}`,
      renotify: true,
    });
    n.onclick = () => {
      window.focus();
      onClick?.(item.conversationId);
      n.close();
    };
  } catch {
    // Some browsers (e.g. Android Chrome) only allow notifications from a service worker.
  }
}

/**
 * Which new customer messages should alert this agent: chats assigned to me,
 * plus unassigned chats the AI isn't handling, unless I'm set to Away.
 */
export function relevantForMe(items, myId, myStatus) {
  return items.filter((item) => {
    if (item.assigneeId) return item.assigneeId === myId;
    if (item.aiStatus === "active") return false;
    return myStatus !== "away";
  });
}
