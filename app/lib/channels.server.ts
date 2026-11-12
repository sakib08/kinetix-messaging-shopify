import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { ApiError } from "./errors.server";
import { getJson, postForm, postJson } from "./http.server";
import {
  addMessage,
  getConversation,
  hoursSnapshot,
  onlineAgents,
  storeInbound,
} from "./inbox.server";
import prisma from "../db.server";
import {
  assertKnownShop,
  channelConfig,
  readMeta,
  readSettings,
  requireShopDomain,
} from "./settings.server";

const GRAPH = "https://graph.facebook.com/v23.0/";

type Cfg = Record<string, unknown>;

export async function agentSend(input: {
  shop: string;
  channel: string;
  conversationId: number;
  recipientId: string;
  text: string;
  agentId: number;
  agentName: string;
  attachmentId?: number;
  html?: string;
  subject?: string;
  toName?: string;
}) {
  const conversation = await getConversation(input.shop, input.conversationId);
  if (!conversation) throw new ApiError("Conversation not found.", 404);
  const cfg = await channelConfig(input.shop, input.channel);
  if (!cfg.enabled) {
    throw new ApiError(`Turn on ${input.channel} in settings before sending.`, 400);
  }

  let meta: Record<string, unknown> = {};
  let body = input.html || input.text;
  if (input.attachmentId) {
    const upload = await prisma.upload.findFirst({
      where: { id: input.attachmentId, shop: input.shop },
    });
    if (!upload) throw new ApiError("That file is no longer available.", 400);
    meta = {
      attachment: {
        url: upload.url,
        name: upload.name,
        mime: upload.mime,
        kind: upload.kind,
      },
      caption: input.text,
    };
    if (!body.trim()) body = upload.kind === "pdf" ? "Sent a PDF" : "Sent an image";
  }
  if (!body.trim()) throw new ApiError("Message text is required.");

  await deliver(input.channel, input.recipientId, input.text || body, cfg, {
    html: input.html,
    subject: input.subject,
    toName: input.toName,
    attachmentUrl: typeof meta.attachment === "object" && meta.attachment
      ? String((meta.attachment as { url?: string }).url || "")
      : "",
  });

  const message = await addMessage({
    shop: input.shop,
    conversationId: input.conversationId,
    body,
    senderType: "agent",
    senderId: input.agentId,
    senderName: input.agentName,
    channel: input.channel,
    meta,
  });
  return { ok: true, messageId: message.id, message };
}

export async function deliver(
  channel: string,
  recipientId: string,
  text: string,
  cfg: Cfg,
  extra: { html?: string; subject?: string; toName?: string; attachmentUrl?: string } = {},
) {
  switch (channel) {
    case "livechat":
      return { ok: true };
    case "email":
      return sendMail(cfg, {
        to: recipientId,
        toName: extra.toName,
        subject: extra.subject || "Re: your message",
        html: extra.html || `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`,
      });
    case "telegram":
      return sendTelegram(recipientId, text, cfg);
    case "whatsapp":
      return sendWhatsApp(recipientId, text, cfg);
    case "messenger":
    case "instagram":
      return sendMeta(recipientId, text, cfg);
    case "line":
      return sendLine(recipientId, text, cfg);
    case "viber":
      return sendViber(recipientId, text, cfg);
    case "wechat":
      return sendWeChat(recipientId, text, cfg);
    case "sms":
      return sendSms(recipientId, text, cfg);
    default:
      throw new ApiError(`No send endpoint for channel: ${channel}`, 400);
  }
}

export async function sendMail(
  cfg: Cfg,
  message: { to: string; toName?: string; subject: string; html: string },
) {
  const host = String(cfg.smtpHost || "");
  if (!host) throw new ApiError("SMTP host is not configured.", 400);
  const port = Number(cfg.smtpPort || 587);
  const user = String(cfg.smtpUser || "");
  const pass = String(cfg.smtpPass || "");
  const fromEmail = String(cfg.inboxEmail || user);
  const fromName = String(cfg.senderName || cfg.inboxName || "Support");
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
    tls: cfg.smtpVerifySsl === false ? { rejectUnauthorized: false } : undefined,
  });
  const info = await transport.sendMail({
    from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
    to: message.toName ? `"${message.toName}" <${message.to}>` : message.to,
    subject: message.subject,
    html: message.html,
    replyTo: String(cfg.replyTo || fromEmail),
  });
  return { ok: true, messageId: info.messageId, sentTo: message.to };
}

async function sendTelegram(recipientId: string, text: string, cfg: Cfg) {
  const token = String(cfg.botToken || "");
  if (!token) throw new ApiError("Telegram bot token is not configured.", 400);
  if (cfg.typingIndicator) {
    await postJson(`https://api.telegram.org/bot${token}/sendChatAction`, {
      chat_id: recipientId,
      action: "typing",
    }).catch(() => undefined);
  }
  return postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: recipientId,
    text,
    ...(cfg.markdown ? { parse_mode: "Markdown" } : {}),
  });
}

async function sendWhatsApp(recipientId: string, text: string, cfg: Cfg) {
  const token = String(cfg.accessToken || "");
  const phoneNumberId = String(cfg.phoneNumberId || "");
  if (!token || !phoneNumberId) {
    throw new ApiError("WhatsApp access token and phone number ID are required.", 400);
  }
  return postJson(
    `${GRAPH}${phoneNumberId}/messages`,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipientId.replace(/^\+/, ""),
      type: "text",
      text: { body: text, preview_url: false },
    },
    { Authorization: `Bearer ${token}` },
  );
}

async function sendMeta(recipientId: string, text: string, cfg: Cfg) {
  const token = String(cfg.pageToken || "");
  if (!token) throw new ApiError("Page access token is not configured.", 400);
  if (cfg.typingIndicator) {
    await postJson(`${GRAPH}me/messages?access_token=${encodeURIComponent(token)}`, {
      recipient: { id: recipientId },
      sender_action: "typing_on",
    }).catch(() => undefined);
  }
  return postJson(`${GRAPH}me/messages?access_token=${encodeURIComponent(token)}`, {
    recipient: { id: recipientId },
    message: { text },
    messaging_type: "RESPONSE",
  });
}

async function sendLine(recipientId: string, text: string, cfg: Cfg) {
  const token = String(cfg.accessToken || "");
  if (!token) throw new ApiError("LINE channel access token is not configured.", 400);
  return postJson(
    "https://api.line.me/v2/bot/message/push",
    { to: recipientId, messages: [{ type: "text", text }] },
    { Authorization: `Bearer ${token}` },
  );
}

async function sendViber(recipientId: string, text: string, cfg: Cfg) {
  const token = String(cfg.authToken || "");
  if (!token) throw new ApiError("Viber authentication token is not configured.", 400);
  return postJson(
    "https://chatapi.viber.com/pa/send_message",
    {
      receiver: recipientId,
      type: "text",
      text,
      sender: { name: String(cfg.botName || "Support"), avatar: String(cfg.avatarUrl || "") },
    },
    { "X-Viber-Auth-Token": token },
  );
}

async function sendWeChat(recipientId: string, text: string, cfg: Cfg) {
  const token = await wechatToken(cfg);
  const data = await postJson(
    `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${encodeURIComponent(token)}`,
    { touser: recipientId, msgtype: "text", text: { content: text } },
  );
  return data;
}

async function wechatToken(cfg: Cfg) {
  const appId = String(cfg.appId || "");
  const secret = String(cfg.appSecret || "");
  if (!appId || !secret) throw new ApiError("WeChat App ID and App Secret are required.", 400);
  const data = await getJson(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}`,
  );
  const token = String(data.access_token || "");
  if (!token) throw new ApiError("WeChat did not return an access token.", 502);
  return token;
}

async function sendSms(recipientId: string, text: string, cfg: Cfg) {
  const provider = String(cfg.provider || "twilio").toLowerCase();
  const from = String(cfg.fromNumber || "");
  if (provider === "twilio") {
    const sid = String(cfg.accountSid || "");
    const auth = String(cfg.authToken || "");
    if (!sid || !auth || !from) {
      throw new ApiError("Twilio Account SID, Auth Token, and From number are required.", 400);
    }
    return postForm(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      { To: recipientId, From: from, Body: text },
      { Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString("base64")}` },
    );
  }
  if (provider === "vonage") {
    const key = String(cfg.vonageKey || "");
    const secret = String(cfg.vonageSecret || "");
    if (!key || !secret || !from) throw new ApiError("Vonage key, secret, and from number are required.", 400);
    return postJson("https://rest.nexmo.com/sms/json", {
      api_key: key,
      api_secret: secret,
      to: recipientId.replace(/\D/g, ""),
      from,
      text,
    });
  }
  const key = String(cfg.genericKey || cfg.accountSid || "");
  const secret = String(cfg.genericSecret || cfg.authToken || "");
  if (!key || !from) throw new ApiError(`${provider} credentials and a from number are required.`, 400);
  if (provider === "messagebird") {
    return postJson(
      "https://rest.messagebird.com/messages",
      { originator: from, recipients: [recipientId], body: text },
      { Authorization: `AccessKey ${key}` },
    );
  }
  if (provider === "telnyx") {
    return postJson(
      "https://api.telnyx.com/v2/messages",
      { from, to: recipientId, text },
      { Authorization: `Bearer ${key}` },
    );
  }
  if (provider === "plivo") {
    return postJson(
      `https://api.plivo.com/v1/Account/${key}/Message/`,
      { src: from, dst: recipientId, text },
      { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` },
    );
  }
  if (provider === "sinch") {
    return postJson(
      `https://sms.api.sinch.com/xms/v1/${key}/batches`,
      { from, to: [recipientId], body: text },
      { Authorization: `Bearer ${secret}` },
    );
  }
  throw new ApiError(`Unknown SMS provider: ${provider}`, 400);
}

export async function testChannel(shop: string, channel: string, body: Cfg = {}) {
  const cfg = await channelConfig(shop, channel);
  if (channel === "email") {
    const type = String(body.type || "smtp");
    if (type === "imap") return testImap(cfg);
    const to = String(cfg.smtpUser || cfg.inboxEmail || "");
    if (!to) throw new ApiError("Save an SMTP user or inbox address first.", 400);
    await sendMail(cfg, {
      to,
      subject: "Kinetix Messaging SMTP test",
      html: "<p>SMTP is connected.</p>",
    });
    return { ok: true, type: "smtp", message: `Test email sent to ${to}`, sentTo: to };
  }
  if (channel === "telegram") {
    const token = String(cfg.botToken || "");
    if (!token) throw new ApiError("Enter a bot token first.", 400);
    const data = await getJson(`https://api.telegram.org/bot${token}/getMe`);
    return { ok: true, message: `Connected as @${(data.result as { username?: string } | undefined)?.username || "bot"}` };
  }
  if (channel === "whatsapp") {
    const token = String(cfg.accessToken || "");
    const phoneId = String(cfg.phoneNumberId || "").replace(/\D/g, "");
    if (!token || !phoneId) throw new ApiError("Enter a token and phone number ID first.", 400);
    await getJson(`${GRAPH}${phoneId}?fields=display_phone_number,verified_name`, {
      Authorization: `Bearer ${token}`,
    });
    return { ok: true, message: "WhatsApp phone number is reachable." };
  }
  if (channel === "messenger" || channel === "instagram") {
    const token = String(cfg.pageToken || "");
    if (!token) throw new ApiError("Enter a page token first.", 400);
    await getJson(`${GRAPH}me?access_token=${encodeURIComponent(token)}`);
    return { ok: true, message: "Page token is valid." };
  }
  if (channel === "line") {
    const token = String(cfg.accessToken || "");
    if (!token) throw new ApiError("Enter a channel access token first.", 400);
    await getJson("https://api.line.me/v2/bot/info", { Authorization: `Bearer ${token}` });
    return { ok: true, message: "LINE bot info loaded." };
  }
  if (channel === "viber") {
    const token = String(cfg.authToken || "");
    if (!token) throw new ApiError("Enter a Viber auth token first.", 400);
    await postJson("https://chatapi.viber.com/pa/get_account_info", {}, { "X-Viber-Auth-Token": token });
    return { ok: true, message: "Viber account info loaded." };
  }
  if (channel === "wechat") {
    await wechatToken(cfg);
    return { ok: true, message: "WeChat access token issued." };
  }
  if (channel === "sms") {
    if (!cfg.accountSid && !cfg.vonageKey && !cfg.genericKey) {
      throw new ApiError("Enter the SMS provider credentials first.", 400);
    }
    return { ok: true, message: `${String(cfg.provider || "twilio")} credentials are saved. Send a test from a conversation to confirm delivery.` };
  }
  if (channel === "livechat") {
    if (!cfg.widgetToken && cfg.enabled) {
      throw new ApiError("Save live chat once so a widget token is created.", 400);
    }
    return { ok: true, message: cfg.enabled ? "Live chat is enabled for the storefront." : "Enable live chat, then add the theme app embed." };
  }
  throw new ApiError("Nothing to test for this channel.", 400);
}

async function testImap(cfg: Cfg) {
  const { ImapFlow } = await import("imapflow");
  const port = Number(cfg.imapPort || 993);
  const client = new ImapFlow({
    host: String(cfg.imapHost || ""),
    port,
    secure: port === 993,
    auth: { user: String(cfg.imapUser || ""), pass: String(cfg.imapPass || "") },
  });
  await client.connect();
  await client.logout();
  return { ok: true, type: "imap", message: "IMAP login succeeded." };
}

export async function telegramWebhookInfo(shop: string) {
  const cfg = await channelConfig(shop, "telegram");
  const token = String(cfg.botToken || "");
  const expected = publicWebhookUrl(shop, "telegram");
  if (!token) {
    return { error: "Enter a bot token first.", registered: false, channelEnabled: Boolean(cfg.enabled) };
  }
  const data = await getJson(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const result = (data.result || {}) as {
    url?: string;
    pending_update_count?: number;
    last_error_message?: string;
    last_error_date?: number;
  };
  return {
    registered: Boolean(result.url),
    urlMatch: result.url === expected,
    webhookUrl: result.url || "",
    hasWebhookSecret: Boolean(cfg.webhookSecret),
    channelEnabled: Boolean(cfg.enabled),
    pendingUpdateCount: result.pending_update_count || 0,
    lastError: result.last_error_message || "",
    lastErrorAt: result.last_error_date || null,
  };
}

export async function registerTelegramWebhook(shop: string, dropPending = false) {
  const settings = await readSettings(shop);
  const cfg = { ...(settings.telegram || {}) };
  const token = String(cfg.botToken || "");
  if (!token) throw new ApiError("Bot token is not configured. Save the Telegram settings first.", 400);
  let secret = String(cfg.webhookSecret || "");
  if (!secret) {
    secret = crypto.randomBytes(16).toString("hex");
    const { saveSettings } = await import("./settings.server");
    await saveSettings(shop, { telegram: { webhookSecret: secret } });
  }
  await postJson(`https://api.telegram.org/bot${token}/setWebhook`, {
    url: publicWebhookUrl(shop, "telegram"),
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: dropPending,
    secret_token: secret,
  });
  return { ok: true, url: publicWebhookUrl(shop, "telegram") };
}

export async function registerViberWebhook(shop: string) {
  const cfg = await channelConfig(shop, "viber");
  const token = String(cfg.authToken || "");
  if (!token) throw new ApiError("Save a Viber auth token first.", 400);
  await postJson(
    "https://chatapi.viber.com/pa/set_webhook",
    { url: publicWebhookUrl(shop, "viber"), event_types: ["message", "delivered", "seen", "failed"] },
    { "X-Viber-Auth-Token": token },
  );
  return { ok: true, url: publicWebhookUrl(shop, "viber") };
}

export function publicWebhookUrl(shop: string, channel: string) {
  const base = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  return `${base}/webhooks/channels/${channel}?shop=${encodeURIComponent(shop)}`;
}

export async function handleProviderWebhook(request: Request, channel: string) {
  const url = new URL(request.url);
  const shop = requireShopDomain(url.searchParams.get("shop"));
  await assertKnownShop(shop);
  const cfg = await channelConfig(shop, channel);
  const raw = request.method === "GET" ? "" : await request.text();

  if (request.method === "GET" && (channel === "whatsapp" || channel === "messenger" || channel === "instagram")) {
    return metaVerify(url, cfg);
  }
  if (request.method === "GET" && channel === "wechat") {
    return wechatVerify(url, cfg);
  }
  if (request.method !== "POST") return new Response("ok");

  if (!cfg.enabled) return Response.json({ ok: true, ignored: true });
  verifySignature(channel, request, raw, cfg, url);

  const contentType = request.headers.get("content-type") || "";
  const params = contentType.includes("application/json")
    ? asRecord(safeJson(raw))
    : Object.fromEntries(new URLSearchParams(raw));

  if (channel === "telegram") await ingestTelegram(shop, params, cfg);
  else if (channel === "whatsapp") await ingestWhatsApp(shop, params, cfg);
  else if (channel === "messenger" || channel === "instagram") await ingestMetaMessaging(shop, channel, params, cfg);
  else if (channel === "line") await ingestLine(shop, params, cfg);
  else if (channel === "viber") await ingestViber(shop, params, cfg);
  else if (channel === "sms") await ingestSms(shop, params, cfg);
  else if (channel === "wechat") await ingestWeChat(shop, raw, cfg);
  else if (channel === "email") await ingestEmail(shop, params, cfg);

  if (channel === "sms" && String(cfg.provider || "twilio") === "twilio") {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { "Content-Type": "text/xml" },
    });
  }
  if (channel === "viber") return Response.json({ status: 0 });
  return Response.json({ ok: true });
}

function metaVerify(url: URL, cfg: Cfg) {
  const mode = url.searchParams.get("hub.mode") || url.searchParams.get("hub_mode") || "";
  const token = url.searchParams.get("hub.verify_token") || url.searchParams.get("hub_verify_token") || "";
  const challenge = url.searchParams.get("hub.challenge") || url.searchParams.get("hub_challenge") || "";
  const expected = String(cfg.verifyToken || "");
  if (mode === "subscribe" && expected && token === expected) {
    return new Response(challenge, { headers: { "Content-Type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

function wechatVerify(url: URL, cfg: Cfg) {
  const token = String(cfg.serverToken || "");
  const signature = url.searchParams.get("signature") || "";
  const timestamp = url.searchParams.get("timestamp") || "";
  const nonce = url.searchParams.get("nonce") || "";
  const echostr = url.searchParams.get("echostr") || "";
  const digest = crypto.createHash("sha1").update([token, timestamp, nonce].sort().join("")).digest("hex");
  if (token && digest === signature) return new Response(echostr, { headers: { "Content-Type": "text/plain" } });
  return new Response("forbidden", { status: 403 });
}

function verifySignature(channel: string, request: Request, raw: string, cfg: Cfg, url: URL) {
  if (channel === "telegram") {
    const secret = String(cfg.webhookSecret || "");
    if (!secret) return;
    const given = request.headers.get("x-telegram-bot-api-secret-token") || "";
    if (given !== secret) throw new ApiError("Invalid Telegram webhook secret.", 403);
    return;
  }
  if (channel === "whatsapp" || channel === "messenger" || channel === "instagram") {
    const secret = String(cfg.appSecret || "");
    if (!secret) return;
    const given = request.headers.get("x-hub-signature-256") || "";
    const expected = `sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`;
    if (given !== expected) throw new ApiError("Invalid Meta signature.", 403);
    return;
  }
  if (channel === "line") {
    const secret = String(cfg.channelSecret || "");
    if (!secret) return;
    const given = request.headers.get("x-line-signature") || "";
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("base64");
    if (given !== expected) throw new ApiError("Invalid LINE signature.", 403);
    return;
  }
  if (channel === "viber") {
    const token = String(cfg.authToken || "");
    if (!token) return;
    const given = request.headers.get("x-viber-content-signature") || "";
    const expected = crypto.createHmac("sha256", token).update(raw).digest("hex");
    if (given !== expected) throw new ApiError("Invalid Viber signature.", 403);
    return;
  }
  if (channel === "email" || channel === "sms") {
    const token = String(cfg.webhookToken || "");
    if (!token) return;
    const given = request.headers.get("x-kmbp-token") || url.searchParams.get("token") || "";
    if (given !== token) throw new ApiError("Invalid webhook token.", 403);
  }
}

async function afterInbound(
  shop: string,
  channel: string,
  result: { conversationId: number; created: boolean; first: boolean },
  recipientId: string,
  contactName: string,
  text: string,
  cfg: Cfg,
) {
  if (!result.created) return;
  const { handleInbound } = await import("./ai.server");
  const aiSent = await handleInbound({
    shop,
    conversationId: result.conversationId,
    channel,
    text,
    recipientId,
    contactName,
  });
  if (cfg.autoAssign && result.first && !aiSent) {
    const agents = await onlineAgents(shop);
    if (agents[0]) {
      await prisma.conversation.update({
        where: { id: result.conversationId },
        data: { assigneeId: agents[0].id },
      });
    }
  }
  if (aiSent || !result.first) return;
  const settings = await readSettings(shop);
  const { timezone } = await readMeta(shop);
  const hours = hoursSnapshot(settings, timezone);
  const offline = settings.availability || {};
  if (hours.enabled && !hours.open && offline.offlineMsgEnabled && offline.offlineMsg) {
    const notice = String(offline.offlineMsg).replaceAll("{{hours}}", hours.summary || "our posted hours");
    await replyAsSystem(shop, channel, result.conversationId, recipientId, fillName(notice, contactName), cfg, "Away");
    return;
  }
  if (cfg.autoReply && cfg.autoReplyMsg) {
    await replyAsSystem(
      shop,
      channel,
      result.conversationId,
      recipientId,
      fillName(String(cfg.autoReplyMsg), contactName),
      cfg,
      "Auto reply",
    );
  }
}

async function replyAsSystem(
  shop: string,
  channel: string,
  conversationId: number,
  recipientId: string,
  text: string,
  cfg: Cfg,
  senderName: string,
) {
  await deliver(channel, recipientId, text, cfg, {
    subject: "We received your message",
    html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`,
  });
  await addMessage({
    shop,
    conversationId,
    body: text,
    senderType: "agent",
    senderName,
    channel,
    meta: { auto: true },
  });
}

function fillName(template: string, name: string) {
  const first = name.split(" ")[0] || name || "there";
  return template
    .replaceAll("{{user_first_name}}", first)
    .replaceAll("{{customer_name}}", name || "there")
    .replaceAll("{{name}}", name || "there");
}

async function ingestTelegram(shop: string, update: Cfg, cfg: Cfg) {
  const message = asRecord(update.message);
  if (!Object.keys(message).length) {
    const callback = asRecord(update.callback_query);
    const token = String(cfg.botToken || "");
    if (token && callback.id) {
      await postJson(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        callback_query_id: callback.id,
      }).catch(() => undefined);
    }
    return;
  }
  const chat = asRecord(message.chat);
  const from = asRecord(message.from);
  const chatId = String(chat.id || "");
  if (!chatId) return;
  const text = telegramText(message);
  const name = `${from.first_name || ""} ${from.last_name || ""}`.trim() || String(from.username || "Telegram user");
  const handle = from.username ? `@${from.username}` : chatId;
  if (text.startsWith("/start") && cfg.startReply && cfg.startMsg) {
    await sendTelegram(chatId, String(cfg.startMsg), cfg).catch(() => undefined);
  }
  const result = await storeInbound({
    shop,
    channel: "telegram",
    externalId: chatId,
    contactName: name,
    contactHandle: handle,
    subject: text.slice(0, 80) || "Telegram message",
    body: escapeHtml(text),
    messageExternalId: message.message_id ? `tg_${message.message_id}` : "",
    meta: { channel: "telegram", chatId },
  });
  await afterInbound(shop, "telegram", result, chatId, name, text, cfg);
}

function telegramText(message: Cfg) {
  const text = String(message.text || message.caption || "");
  if (text) return text;
  if (message.photo) return "[Photo]";
  if (message.document) return `[Document: ${asRecord(message.document).file_name || "file"}]`;
  if (message.voice) return "[Voice message]";
  if (message.video) return "[Video]";
  if (message.sticker) return `[Sticker: ${asRecord(message.sticker).emoji || ""}]`;
  return "[Unsupported message type]";
}

async function ingestWhatsApp(shop: string, body: Cfg, cfg: Cfg) {
  if (body.object !== "whatsapp_business_account") return;
  for (const entry of asArray(body.entry)) {
    for (const change of asArray(asRecord(entry).changes)) {
      const value = asRecord(asRecord(change).value);
      const names = new Map<string, string>();
      for (const contact of asArray(value.contacts)) {
        const row = asRecord(contact);
        const profile = asRecord(row.profile);
        names.set(String(row.wa_id || ""), String(profile.name || row.wa_id || ""));
      }
      for (const message of asArray(value.messages)) {
        const row = asRecord(message);
        const from = String(row.from || "");
        if (!from) continue;
        const text = whatsappText(row);
        const name = names.get(from) || from;
        const result = await storeInbound({
          shop,
          channel: "whatsapp",
          externalId: from,
          contactName: name,
          contactHandle: `+${from.replace(/^\+/, "")}`,
          phone: `+${from.replace(/^\+/, "")}`,
          subject: text.slice(0, 80) || "WhatsApp message",
          body: escapeHtml(text),
          messageExternalId: row.id ? `wa_${row.id}` : "",
          meta: { channel: "whatsapp", from },
        });
        await afterInbound(shop, "whatsapp", result, from, name, text, cfg);
      }
    }
  }
}

function whatsappText(message: Cfg) {
  const type = String(message.type || "text");
  if (type === "text") return String(asRecord(message.text).body || "");
  if (type === "image") return `[Image${asRecord(message.image).caption ? `: ${asRecord(message.image).caption}` : ""}]`;
  if (type === "document") return `[Document: ${asRecord(message.document).filename || "file"}]`;
  return `[${type}]`;
}

async function ingestMetaMessaging(shop: string, channel: string, body: Cfg, cfg: Cfg) {
  for (const entry of asArray(body.entry)) {
    for (const event of asArray(asRecord(entry).messaging)) {
      const row = asRecord(event);
      const message = asRecord(row.message);
      if (!Object.keys(message).length || message.is_echo) continue;
      const sender = String(asRecord(row.sender).id || "");
      if (!sender) continue;
      let text = String(message.text || "");
      if (!text && Array.isArray(message.attachments)) {
        text = `[${message.attachments.length} attachment]`;
      }
      if (!text) text = "[Message]";
      const result = await storeInbound({
        shop,
        channel,
        externalId: sender,
        contactName: channel === "instagram" ? "Instagram user" : "Messenger user",
        contactHandle: sender,
        subject: text.slice(0, 80),
        body: escapeHtml(text),
        messageExternalId: message.mid ? `${channel}_${message.mid}` : "",
        meta: { channel, sender },
      });
      await afterInbound(shop, channel, result, sender, "there", text, cfg);
    }
  }
}

async function ingestLine(shop: string, body: Cfg, cfg: Cfg) {
  for (const event of asArray(body.events)) {
    const row = asRecord(event);
    if (row.type !== "message") continue;
    const userId = String(asRecord(row.source).userId || "");
    const message = asRecord(row.message);
    if (!userId) continue;
    const text = message.type === "text" ? String(message.text || "") : `[${message.type || "message"}]`;
    const result = await storeInbound({
      shop,
      channel: "line",
      externalId: userId,
      contactName: "LINE user",
      contactHandle: userId,
      subject: text.slice(0, 80) || "LINE message",
      body: escapeHtml(text),
      messageExternalId: row.webhookEventId ? `line_${row.webhookEventId}` : "",
      meta: { channel: "line", userId },
    });
    await afterInbound(shop, "line", result, userId, "there", text, cfg);
  }
}

async function ingestViber(shop: string, body: Cfg, cfg: Cfg) {
  if (body.event !== "message") return;
  const sender = asRecord(body.sender);
  const message = asRecord(body.message);
  const userId = String(sender.id || "");
  if (!userId) return;
  const text = message.type === "text" ? String(message.text || "") : `[${message.type || "message"}]`;
  const name = String(sender.name || "Viber user");
  const result = await storeInbound({
    shop,
    channel: "viber",
    externalId: userId,
    contactName: name,
    contactHandle: userId,
    subject: text.slice(0, 80) || "Viber message",
    body: escapeHtml(text),
    messageExternalId: body.message_token ? `viber_${body.message_token}` : "",
    meta: { channel: "viber", userId },
  });
  await afterInbound(shop, "viber", result, userId, name, text, cfg);
}

async function ingestSms(shop: string, params: Cfg, cfg: Cfg) {
  const provider = String(cfg.provider || "twilio");
  const from = String(params.From || params.msisdn || params.from || params.originator || "");
  const text = String(params.Body || params.text || params.body || "");
  const id = String(params.MessageSid || params.messageId || params.id || "");
  if (!from || !text) return;
  const keyword = text.trim().toUpperCase();
  if (["STOP", "START", "HELP"].includes(keyword) && cfg.optOut) {
    const reply =
      keyword === "HELP"
        ? String(cfg.helpMsg || "Reply STOP to unsubscribe.")
        : keyword === "STOP"
          ? "You are unsubscribed. Reply START to opt back in."
          : "You are opted in. Reply STOP to unsubscribe.";
    await sendSms(from, reply, cfg).catch(() => undefined);
  }
  const result = await storeInbound({
    shop,
    channel: "sms",
    externalId: from,
    contactName: from,
    contactHandle: from,
    phone: from,
    subject: text.slice(0, 80) || "SMS message",
    body: escapeHtml(text),
    messageExternalId: id ? `sms_${id}` : "",
    meta: { channel: "sms", provider, from },
  });
  await afterInbound(shop, "sms", result, from, from, text, cfg);
}

async function ingestWeChat(shop: string, raw: string, cfg: Cfg) {
  const from = xmlTag(raw, "FromUserName");
  const type = xmlTag(raw, "MsgType");
  const content = xmlTag(raw, "Content") || `[${type || "message"}]`;
  const msgId = xmlTag(raw, "MsgId");
  if (!from) return;
  const result = await storeInbound({
    shop,
    channel: "wechat",
    externalId: from,
    contactName: "WeChat user",
    contactHandle: from,
    subject: content.slice(0, 80),
    body: escapeHtml(content),
    messageExternalId: msgId ? `wechat_${msgId}` : "",
    meta: { channel: "wechat", from },
  });
  await afterInbound(shop, "wechat", result, from, "there", content, cfg);
}

async function ingestEmail(shop: string, params: Cfg, cfg: Cfg) {
  const fromRaw = String(params.from || params.From || params.sender || "");
  const parsed = parseFrom(fromRaw);
  if (!parsed.email) throw new ApiError("Could not parse sender address.", 400);
  const subject = String(params.subject || params.Subject || "(no subject)");
  const plain = String(params["body-plain"] || params.TextBody || params.text || "");
  const html = String(params["body-html"] || params.HtmlBody || params.html || "");
  const body = html || `<p>${escapeHtml(plain).replace(/\n/g, "<br>")}</p>`;
  if (!plain && !html) throw new ApiError("Email body is empty.", 400);
  const messageId = String(params["Message-Id"] || params.MessageID || params["message-id"] || "");
  const result = await storeInbound({
    shop,
    channel: "email",
    externalId: parsed.email,
    contactName: parsed.name || parsed.email,
    contactHandle: parsed.email,
    email: parsed.email,
    subject,
    body,
    messageExternalId: messageId ? `email_${messageId}` : "",
    meta: { channel: "email" },
  });
  await afterInbound(shop, "email", result, parsed.email, parsed.name || parsed.email, plain || subject, cfg);
}

export async function pollEmail(shop: string) {
  const cfg = await channelConfig(shop, "email");
  if (!cfg.enabled) throw new ApiError("Turn on email before polling.", 400);
  if (!cfg.imapHost || !cfg.imapUser) throw new ApiError("IMAP host and user are required.", 400);
  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");
  const port = Number(cfg.imapPort || 993);
  const client = new ImapFlow({
    host: String(cfg.imapHost),
    port,
    secure: port === 993,
    auth: { user: String(cfg.imapUser), pass: String(cfg.imapPass || "") },
  });
  let processed = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(String(cfg.imapFolder || "INBOX"));
    try {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      for await (const message of client.fetch({ seen: false, since }, { source: true, uid: true })) {
        if (!message.source) continue;
        const parsed = await simpleParser(message.source);
        const from = parsed.from?.value?.[0];
        if (!from?.address) continue;
        await storeInbound({
          shop,
          channel: "email",
          externalId: from.address,
          contactName: from.name || from.address,
          contactHandle: from.address,
          email: from.address,
          subject: parsed.subject || "(no subject)",
          body: parsed.html || `<p>${escapeHtml(parsed.text || "")}</p>`,
          messageExternalId: parsed.messageId ? `email_${parsed.messageId}` : `imap_${message.uid}`,
          meta: { channel: "email", via: "imap" },
        });
        await client.messageFlagsAdd(message.uid, ["\\Seen"], { uid: true });
        processed += 1;
        if (processed >= 30) break;
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (error) {
    const message = error instanceof Error ? error.message : "IMAP poll failed";
    const { writeMeta } = await import("./settings.server");
    await writeMeta(shop, {
      emailPoll: { ok: false, message, processed, lastRunAt: Date.now() },
    });
    throw new ApiError(message, 502);
  }
  const { writeMeta } = await import("./settings.server");
  await writeMeta(shop, {
    emailPoll: { ok: true, message: `Imported ${processed} message(s).`, processed, lastRunAt: Date.now() },
  });
  return { ok: true, processed, skipped: 0, threads: processed };
}

export async function emailPollStatus(shop: string) {
  const { readMeta } = await import("./settings.server");
  const { meta } = await readMeta(shop);
  const status = asRecord(meta.emailPoll);
  return {
    lastRunAt: status.lastRunAt || null,
    ok: status.ok ?? null,
    message: status.message || "",
    processed: status.processed || 0,
    skipped: status.skipped || 0,
    cronRegistered: false,
    nextRunAt: null,
  };
}

export async function saveUpload(shop: string, file: File) {
  const allowed = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]);
  if (!allowed.has(file.type)) throw new ApiError("Upload a JPEG, PNG, GIF, WebP, or PDF.", 400);
  if (file.size > 5 * 1024 * 1024) throw new ApiError("Files must be 5 MB or smaller.", 400);
  const safeShop = shop.replace(/[^a-z0-9.-]/gi, "_");
  const ext = path.extname(file.name).slice(0, 8) || "";
  const name = `${crypto.randomUUID()}${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", safeShop);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  const url = `${appUrl}/uploads/${safeShop}/${name}`;
  const kind = file.type === "application/pdf" ? "pdf" : file.type === "image/gif" ? "gif" : "image";
  const row = await prisma.upload.create({
    data: { shop, url, name: file.name, mime: file.type, kind },
  });
  return { id: row.id, url, name: file.name, mime: file.type, kind };
}

export async function livechatConfig(shop: string) {
  const cfg = await channelConfig(shop, "livechat");
  if (!cfg.enabled) return { enabled: false };
  return {
    enabled: true,
    brandName: cfg.brandName || "",
    tagline: cfg.tagline || "",
    welcomeMessage: cfg.welcomeMessage || "",
    starterPrompt: cfg.starterPrompt || "",
    iceList: Array.isArray(cfg.iceList) ? cfg.iceList : [],
    themeColor: cfg.themeColor || "#7C3AED",
    position: cfg.position || "bottom-right",
    onlineText: cfg.onlineText || "A few minutes",
    agentName: cfg.agentName || "Support",
    askName: cfg.askName !== false,
    widgetToken: cfg.widgetToken || "",
  };
}

export async function livechatInbound(shop: string, body: Cfg, token: string) {
  const cfg = await channelConfig(shop, "livechat");
  if (!cfg.enabled) throw new ApiError("Live chat is off.", 403);
  const expected = String(cfg.widgetToken || "");
  if (!expected || token !== expected) throw new ApiError("Invalid widget token.", 403);
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const name = String(body.senderName || "").trim();
  const text = String(body.text || "").trim().slice(0, 4000);
  if (!email.includes("@")) throw new ApiError("A valid email address is required to chat.", 400);
  if (!phone) throw new ApiError("A phone number is required to chat.", 400);
  if (!text && !body.attachmentId) throw new ApiError("Message text is required.", 400);
  const roomId = String(body.roomId || "") || `kmbp-e-${crypto.createHash("sha256").update(email).digest("hex").slice(0, 28)}`;
  let meta: Record<string, unknown> = {};
  let stored = text;
  if (body.attachmentId) {
    const upload = await prisma.upload.findFirst({
      where: { id: Number(body.attachmentId), shop },
    });
    if (!upload) throw new ApiError("That file is no longer available.", 400);
    meta = { attachment: { url: upload.url, name: upload.name, mime: upload.mime, kind: upload.kind }, caption: text };
    stored = text || (upload.kind === "pdf" ? "Sent a PDF" : "Sent an image");
  }
  const result = await storeInbound({
    shop,
    channel: "livechat",
    externalId: roomId,
    contactName: name || email,
    contactHandle: email,
    email,
    phone,
    subject: stored.slice(0, 80) || "Live chat",
    body: stored,
    messageExternalId: body.messageId ? `live_${body.messageId}` : "",
    meta,
  });
  await afterInbound(shop, "livechat", result, roomId, name || email, text, cfg);
  return { ok: true, roomId, conversationId: result.conversationId };
}

export async function livechatMessages(shop: string, roomId: string, after = 0) {
  const conversation = await prisma.conversation.findFirst({
    where: { shop, channel: "livechat", externalId: roomId },
  });
  if (!conversation) return { messages: [] };
  const rows = await prisma.message.findMany({
    where: { shop, conversationId: conversation.id, ...(after ? { id: { gt: after } } : {}) },
    orderBy: { id: "asc" },
  });
  return {
    messages: rows.map((row) => ({
      id: row.id,
      text: row.body,
      sender: row.senderName,
      isAgent: row.senderType !== "contact",
      sentAt: row.sentAt.toISOString(),
      meta: safeJson(row.meta),
    })),
  };
}

function parseFrom(value: string) {
  const match = /^(.*?)\s*<([^>]+)>$/.exec(value.trim());
  if (match) return { name: match[1].replace(/"/g, "").trim(), email: match[2].trim() };
  if (value.includes("@")) return { name: "", email: value.trim() };
  return { name: "", email: "" };
}

function xmlTag(xml: string, tag: string) {
  const match = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return (match?.[1] || match?.[2] || "").trim();
}

function asRecord(value: unknown): Cfg {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Cfg) : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function recentHistory(shop: string, conversationId: number) {
  const rows = await prisma.message.findMany({
    where: { shop, conversationId },
    orderBy: { id: "desc" },
    take: 8,
  });
  return rows.reverse().map((row) => ({
    role: row.senderType === "contact" || row.senderType === "customer" ? "user" : "assistant",
    content: row.body.replace(/<[^>]+>/g, " ").trim(),
  }));
}
