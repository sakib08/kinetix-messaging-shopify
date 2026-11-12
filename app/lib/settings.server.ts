import prisma from "../db.server";
import { ApiError } from "./errors.server";

export const SETTING_KEYS = [
  "messenger",
  "email",
  "whatsapp",
  "telegram",
  "sms",
  "line",
  "viber",
  "wechat",
  "instagram",
  "livechat",
  "ai",
  "availability",
  "notifications",
] as const;

const SECRET_KEYS = new Set([
  "accessToken",
  "authToken",
  "channelSecret",
  "channelAccessToken",
  "appSecret",
  "smtpPass",
  "imapPass",
  "serverToken",
  "encodingAesKey",
  "pageToken",
  "botToken",
  "webhookToken",
  "webhookSecret",
  "verifyToken",
  "apiKey",
  "vonageSecret",
  "genericSecret",
  "widgetToken",
]);

export type SettingsMap = Record<string, Record<string, unknown>>;

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function readSettings(shop: string): Promise<SettingsMap> {
  const row = await prisma.shopSettings.findUnique({ where: { shop } });
  return parseJson<SettingsMap>(row?.settings, {});
}

export async function channelConfig(shop: string, channel: string) {
  const all = await readSettings(shop);
  return all[channel] || {};
}

export function scrubSettings(settings: SettingsMap) {
  const out: SettingsMap = {};
  for (const key of SETTING_KEYS) {
    out[key] = scrubRecord(settings[key] || {});
  }
  return out;
}

function scrubRecord(values: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...values };
  for (const key of Object.keys(out)) {
    if (!SECRET_KEYS.has(key)) continue;
    const value = out[key];
    if (typeof value === "string" && value !== "") {
      out[key] = "••••••••";
      out[`${key}_set`] = true;
    }
  }
  return out;
}

function sanitizeIncoming(payload: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) || key.endsWith("_set")) continue;
    if (typeof value === "string" && /^•+$/u.test(value)) continue;
    out[key] = value;
  }
  return out;
}

export async function saveSettings(shop: string, payload: SettingsMap) {
  const existing = await readSettings(shop);
  for (const [channel, values] of Object.entries(payload)) {
    if (!SETTING_KEYS.includes(channel as (typeof SETTING_KEYS)[number])) continue;
    if (!values || typeof values !== "object") continue;
    const current = existing[channel] || {};
    existing[channel] = { ...current, ...sanitizeIncoming(values) };
  }
  const livechat = existing.livechat;
  if (livechat?.enabled && !livechat.widgetToken) {
    livechat.widgetToken = crypto.randomUUID().replace(/-/g, "");
  }
  await prisma.shopSettings.update({
    where: { shop },
    data: { settings: JSON.stringify(existing) },
  });
  return scrubSettings(existing);
}

export async function readMeta(shop: string) {
  const row = await prisma.shopSettings.findUnique({ where: { shop } });
  return {
    timezone: row?.timezone || "UTC",
    meta: parseJson<Record<string, unknown>>(row?.meta, {}),
  };
}

export async function writeMeta(shop: string, patch: Record<string, unknown>) {
  const current = await readMeta(shop);
  await prisma.shopSettings.update({
    where: { shop },
    data: { meta: JSON.stringify({ ...current.meta, ...patch }) },
  });
}

export function requireShopDomain(value: string | null) {
  const shop = (value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+$/.test(shop)) {
    throw new ApiError("A shop domain is required on this webhook URL.", 400);
  }
  return shop;
}

export async function assertKnownShop(shop: string) {
  const row = await prisma.shopSettings.findUnique({ where: { shop } });
  if (!row) throw new ApiError("This shop has not installed Kinetix Messaging.", 404);
  return row;
}
