// Thin REST client around the KinetixMessagingBoot bootstrap object that the WP admin
// page exposes via wp_localize_script.  Falls back to sensible defaults so
// the module is still importable when developing outside the WP admin shell.

function readBoot() {
  return typeof window !== "undefined" && window.KinetixMessagingBoot ? window.KinetixMessagingBoot : {};
}

export let restUrl = "/api/kmbp/";
export let gmtOffsetHours = 0;
export let siteTimezone = "UTC";
export let siteOrigin = "";
export let siteHost = "your-app";
export let isLocalWebhookSite = false;
export const restNonce = "";
export const currentUser = { id: 0, name: "You", email: "", roles: [] };
export const caps = {
  isAdmin: true,
  canAccessMessaging: true,
  canManageSettings: true,
  canManageDepts: true,
};

function hostLooksLocal(urlString) {
  try {
    const u = new URL(urlString);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== "https:") return true;
    return (
      host === "localhost" ||
      host.endsWith(".test") ||
      host.endsWith(".local") ||
      host.endsWith(".localhost") ||
      host.startsWith("127.") ||
      host.startsWith("192.168.") ||
      host.startsWith("10.")
    );
  } catch (_) {
    return true;
  }
}

/** Called by the embedded app before the inbox renders. */
export function applyBoot(boot = {}) {
  restUrl = (boot.restUrl || "/api/kmbp/").replace(/\/?$/, "/");
  gmtOffsetHours = Number.isFinite(Number(boot.gmtOffset)) ? Number(boot.gmtOffset) : 0;
  siteTimezone = boot.timezone || "UTC";
  const appUrl = boot.appUrl || "";
  try {
    const u = new URL(appUrl);
    siteOrigin = u.origin;
    siteHost = u.hostname;
  } catch (_) {
    siteOrigin = "";
    siteHost = "your-app";
  }
  isLocalWebhookSite = hostLooksLocal(appUrl || "http://localhost");
  Object.assign(currentUser, boot.user || {});
  Object.assign(caps, boot.caps || {});
}

/** Public webhook URL providers should call. Includes the shop so the app can route the event. */
export const webhookUrl = (slug) => {
  const boot = readBoot();
  const base = String(boot.appUrl || siteOrigin || "").replace(/\/$/, "");
  const shop = boot.shop ? `?shop=${encodeURIComponent(boot.shop)}` : "";
  return `${base}/webhooks/channels/${slug}${shop}`;
};

async function authHeaders(extra = {}) {
  const headers = { Accept: "application/json", ...extra };
  try {
    const bridge = typeof window !== "undefined" ? window.shopify : null;
    if (bridge && typeof bridge.idToken === "function") {
      const token = await bridge.idToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
  } catch (_) {
    /* App Bridge also patches fetch inside the embedded admin. */
  }
  return headers;
}

async function request(path, { method = "GET", body, signal } = {}) {
  const url = restUrl + path.replace(/^\//, "");
  const headers = await authHeaders();
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }

  if (!response.ok) {
    const message = (data && data.message) || `Request failed: ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const api = {
  getSettings:        () => request("settings"),
  getChannelSettings: (channel) => request(`settings/${channel}`),
  saveSettings:       (payload) => request("settings", { method: "POST", body: payload }),
  saveChannel:        (channel, payload) => request(`settings/${channel}`, { method: "POST", body: payload }),

  listDepartments:   () => request("departments"),
  createDepartment:  (payload) => request("departments", { method: "POST", body: payload }),
  updateDepartment:  (id, payload) => request(`departments/${id}`, { method: "PUT", body: payload }),
  deleteDepartment:  (id) => request(`departments/${id}`, { method: "DELETE" }),

  listAgents:        () => request("agents"),
  assignAgentDepts:  (id, departmentIds) => request(`agents/${id}/departments`, { method: "POST", body: { departmentIds } }),

  listKb:     () => request("ai/kb"),
  saveKb:     (payload) => request("ai/kb", { method: "POST", body: payload }),
  deleteKb:   (id) => request(`ai/kb/${id}`, { method: "DELETE" }),
  reindexKb:  () => request("ai/kb/reindex", { method: "POST" }),
  uploadKb: async (files) => {
    const body = new FormData();
    for (const file of files) body.append("files[]", file, file.name);
    const headers = await authHeaders();
    const response = await fetch(restUrl + "ai/kb/upload", {
      method: "POST",
      credentials: "same-origin",
      headers,
      body,
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!response.ok) {
      const message = (data && data.message) || `Request failed: ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  },

  getPresence: () => request("presence"),
  /** Heartbeat that keeps me online; pass "online" or "away" to change status. */
  sendPresence: (status) => request("presence", { method: "POST", body: status ? { status } : {} }),
  /** Fire-and-forget on tab close (fetch may be cancelled during unload). */
  markOfflineBeacon: () => {
    authHeaders({ "Content-Type": "application/json" }).then((headers) => {
      fetch(`${restUrl}presence/offline`, {
        method: "POST",
        headers,
        body: "{}",
        keepalive: true,
      }).catch(() => {});
    });
  },

  /** Lightweight heartbeat. Pass the last seen message id to get new customer messages back. */
  poll: (after = 0) => request(after > 0 ? `poll?after=${after}` : "poll"),

  listConversations: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`conversations${qs ? `?${qs}` : ""}`);
  },
  listMessages:    (cid) => request(`conversations/${cid}/messages`),
  listNewMessages: (cid, afterId) => request(`conversations/${cid}/messages?after_id=${afterId}`),
  createConversation: (payload) => request("conversations", { method: "POST", body: payload }),
  updateConversation:  (id, payload) => request(`conversations/${id}`, { method: "PUT", body: payload }),
  deleteConversation:  (id) => request(`conversations/${id}`, { method: "DELETE" }),
  createMessage: (payload) => request("messages", { method: "POST", body: payload }),
  deleteMessage: (id) => request(`messages/${id}`, { method: "DELETE" }),

  sendEmail:    (payload) => request("email/send",    { method: "POST", body: payload }),
  pollEmail:    () =>        request("email/poll",    { method: "POST" }),
  getEmailPollStatus: () =>  request("email/poll-status"),
  testEmailConnection: (type) => request("email/test-connection", { method: "POST", body: { type } }),

  // Channel-specific outbound send (all share the same { conversationId, recipientId, text } shape).
  sendTelegram:   (payload) => request("telegram/send",   { method: "POST", body: payload }),
  sendWhatsApp:   (payload) => request("whatsapp/send",   { method: "POST", body: payload }),
  testWhatsApp:   () =>        request("whatsapp/test-connection", { method: "POST" }),
  sendMessenger:  (payload) => request("messenger/send",  { method: "POST", body: payload }),
  testMessenger:  () =>        request("messenger/test-connection", { method: "POST" }),
  sendWeChat:     (payload) => request("wechat/send",     { method: "POST", body: payload }),
  testWeChat:     () =>        request("wechat/test-connection", { method: "POST" }),
  sendSms:        (payload) => request("sms/send",        { method: "POST", body: payload }),
  testSms:        () =>        request("sms/test-connection", { method: "POST" }),
  sendLine:       (payload) => request("line/send",       { method: "POST", body: payload }),
  testLine:       () =>        request("line/test-connection", { method: "POST" }),
  sendInstagram:  (payload) => request("instagram/send",  { method: "POST", body: payload }),
  testInstagram:  () =>        request("instagram/test-connection", { method: "POST" }),
  sendViber:      (payload) => request("viber/send",      { method: "POST", body: payload }),
  testViber:      () =>        request("viber/test-connection", { method: "POST" }),
  sendLivechat:   (payload) => request("livechat/send",   { method: "POST", body: payload }),
  uploadLivechat: async (file) => {
    const body = new FormData();
    body.append("file", file, file.name);
    const headers = await authHeaders();
    const response = await fetch(restUrl + "livechat/upload", {
      method: "POST",
      credentials: "same-origin",
      headers,
      body,
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!response.ok) {
      const message = (data && data.message) || `Request failed: ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  },
  testLivechat:   () =>        request("livechat/test-connection", { method: "POST" }),

  /** Generic channel send — picks the right endpoint from the channel slug. */
  sendChannel: (channel, payload) => {
    const map = {
      email:     "email/send",
      telegram:  "telegram/send",
      whatsapp:  "whatsapp/send",
      messenger: "messenger/send",
      wechat:    "wechat/send",
      sms:       "sms/send",
      line:      "line/send",
      instagram: "instagram/send",
      viber:     "viber/send",
      livechat:  "livechat/send",
    };
    const path = map[channel];
    if (!path) return Promise.reject(new Error(`No send endpoint for channel: ${channel}`));
    return request(path, { method: "POST", body: payload });
  },

  /** Register a Telegram webhook with a single API call. */
  registerTelegramWebhook: (body = {}) => request("telegram/set-webhook", { method: "POST", body }),
  /** Fetch live webhook status from Telegram (getWebhookInfo). */
  getTelegramWebhookInfo: () => request("telegram/webhook-info"),
  /** Register Viber webhook via the Viber Chat API. */
  registerViberWebhook: () => request("viber/set-webhook", { method: "POST" }),
};

export default api;
