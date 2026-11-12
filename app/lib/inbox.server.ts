import prisma from "../db.server";
import { ApiError } from "./errors.server";
import { readMeta, readSettings, type SettingsMap } from "./settings.server";

const ONLINE_WINDOW_MS = 180_000;

export type StaffSession = {
  shop: string;
  userId?: bigint | number | string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  accountOwner?: boolean | null;
};

export type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type AgentRow = {
  id: number;
  name: string;
  email: string;
  role: string;
};

export function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : "";
}

export function previewText(body: string) {
  const plain = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const words = plain.split(" ").filter(Boolean);
  if (words.length <= 12) return words.join(" ");
  return `${words.slice(0, 12).join(" ")}…`;
}

function slugify(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return slug || "department";
}

export async function ensureShop(session: StaffSession, admin?: AdminClient) {
  const shop = session.shop;
  let row = await prisma.shopSettings.findUnique({ where: { shop } });
  if (!row) {
    let timezone = "UTC";
    if (admin) {
      try {
        const response = await admin.graphql(`#graphql
          query ShopTimezone { shop { ianaTimezone } }
        `);
        const payload = (await response.json()) as {
          data?: { shop?: { ianaTimezone?: string } };
        };
        timezone = payload.data?.shop?.ianaTimezone || "UTC";
      } catch {
        timezone = "UTC";
      }
    }
    row = await prisma.shopSettings.create({
      data: { shop, settings: "{}", timezone },
    });
    await prisma.department.createMany({
      data: [
        { shop, name: "Support", slug: "support", description: "General customer support" },
        { shop, name: "Sales", slug: "sales", description: "Pre-sales and billing inquiries" },
        { shop, name: "Billing", slug: "billing", description: "Invoices, refunds and account billing" },
      ],
    });
  }

  const shopifyUserId = String(session.userId ?? "owner");
  const name =
    [session.firstName, session.lastName].filter(Boolean).join(" ") ||
    session.email ||
    "Staff";
  const role = session.accountOwner ? "admin" : "agent";
  const agent = await prisma.agent.upsert({
    where: { shop_shopifyUserId: { shop, shopifyUserId } },
    create: {
      shop,
      shopifyUserId,
      name,
      email: session.email || "",
      login: session.email || shopifyUserId,
      role,
      status: "online",
      lastSeenAt: new Date(),
    },
    update: {
      name,
      email: session.email || "",
      role,
    },
  });

  return { shop, timezone: row.timezone, agent };
}

export async function deleteShopData(shop: string) {
  await prisma.message.deleteMany({ where: { shop } });
  await prisma.conversation.deleteMany({ where: { shop } });
  await prisma.contact.deleteMany({ where: { shop } });
  await prisma.agentDepartment.deleteMany({ where: { shop } });
  await prisma.agent.deleteMany({ where: { shop } });
  await prisma.department.deleteMany({ where: { shop } });
  await prisma.kbChunk.deleteMany({ where: { shop } });
  await prisma.kbDocument.deleteMany({ where: { shop } });
  await prisma.upload.deleteMany({ where: { shop } });
  await prisma.shopSettings.deleteMany({ where: { shop } });
  await prisma.session.deleteMany({ where: { shop } });
}

export async function redactCustomer(shop: string, email?: string, phone?: string) {
  const emailNorm = (email || "").trim().toLowerCase();
  const phoneNorm = (phone || "").replace(/\D/g, "");
  const contacts = await prisma.contact.findMany({ where: { shop } });
  const ids = contacts
    .filter((contact) => {
      if (emailNorm && contact.email.toLowerCase() === emailNorm) return true;
      if (phoneNorm && contact.phone.replace(/\D/g, "") === phoneNorm) return true;
      return false;
    })
    .map((contact) => contact.id);
  if (!ids.length) return;
  const conversations = await prisma.conversation.findMany({
    where: { shop, contactId: { in: ids } },
    select: { id: true },
  });
  const conversationIds = conversations.map((row) => row.id);
  if (conversationIds.length) {
    await prisma.message.deleteMany({
      where: { shop, conversationId: { in: conversationIds } },
    });
    await prisma.conversation.deleteMany({
      where: { shop, id: { in: conversationIds } },
    });
  }
  await prisma.contact.deleteMany({ where: { shop, id: { in: ids } } });
}

function effectivePresence(status: string, lastSeenAt: Date | null) {
  if (!lastSeenAt) return "offline";
  if (Date.now() - lastSeenAt.getTime() > ONLINE_WINDOW_MS) return "offline";
  return status === "away" ? "away" : "online";
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function hoursSnapshot(settings: SettingsMap, timezone: string) {
  const availability = settings.availability || {};
  const enabled = Boolean(availability.hoursEnabled);
  const open = !enabled || isOpenNow(availability, timezone);
  return {
    enabled,
    open,
    offline: !open,
    summary: hoursSummary(availability),
    nextOpen: open ? "" : nextOpenLabel(availability, timezone),
    timezone,
  };
}

function isOpenNow(availability: Record<string, unknown>, timezone: string) {
  const parts = zoneParts(new Date(), timezone);
  const key = DAY_KEYS[parts.weekday];
  if (!availability[`${key}Open`]) return false;
  const start = String(availability[`${key}Start`] || "09:00");
  const end = String(availability[`${key}End`] || "17:00");
  const now = parts.hour * 60 + parts.minute;
  return now >= minutes(start) && now <= minutes(end);
}

function nextOpenLabel(availability: Record<string, unknown>, timezone: string) {
  const parts = zoneParts(new Date(), timezone);
  for (let offset = 0; offset < 7; offset += 1) {
    const index = (parts.weekday + offset) % 7;
    const key = DAY_KEYS[index];
    if (!availability[`${key}Open`]) continue;
    const start = String(availability[`${key}Start`] || "09:00");
    if (offset === 0 && parts.hour * 60 + parts.minute > minutes(start)) continue;
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    return `${label} ${start}`;
  }
  return "";
}

function hoursSummary(availability: Record<string, unknown>) {
  return DAY_KEYS.filter((key) => availability[`${key}Open`])
    .map((key) => `${key} ${availability[`${key}Start`] || "09:00"}-${availability[`${key}End`] || "17:00"}`)
    .join(", ");
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map((part) => Number(part) || 0);
  return hour * 60 + minute;
}

function zoneParts(date: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(bag.weekday || "Sun");
    return {
      weekday: weekday < 0 ? 0 : weekday,
      hour: Number(bag.hour) || 0,
      minute: Number(bag.minute) || 0,
    };
  } catch {
    return { weekday: date.getUTCDay(), hour: date.getUTCHours(), minute: date.getUTCMinutes() };
  }
}

export async function listAgents(shop: string) {
  const agents = await prisma.agent.findMany({
    where: { shop },
    orderBy: { name: "asc" },
  });
  const links = await prisma.agentDepartment.findMany({ where: { shop } });
  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    email: agent.email,
    login: agent.login,
    isAgent: agent.role === "agent",
    roles: agent.role === "admin" ? ["administrator"] : ["agent"],
    departmentIds: links
      .filter((link) => link.agentId === agent.id)
      .map((link) => link.departmentId),
    presence: effectivePresence(agent.status, agent.lastSeenAt),
  }));
}

export async function presenceSnapshot(shop: string, agentId: number) {
  const agents = await prisma.agent.findMany({ where: { shop } });
  const me = agents.find((agent) => agent.id === agentId);
  const settings = await readSettings(shop);
  const { timezone } = await readMeta(shop);
  return {
    me: {
      id: agentId,
      status: me?.status || "offline",
      presence: me ? effectivePresence(me.status, me.lastSeenAt) : "offline",
    },
    agents: agents.map((agent) => ({
      id: agent.id,
      presence: effectivePresence(agent.status, agent.lastSeenAt),
    })),
    hours: hoursSnapshot(settings, timezone),
  };
}

export async function touchPresence(
  shop: string,
  agentId: number,
  status?: string,
) {
  const current = await prisma.agent.findFirst({ where: { id: agentId, shop } });
  if (!current) throw new ApiError("Agent not found.", 404);
  let next = current.status;
  if (status === "online" || status === "away" || status === "offline") {
    next = status;
  } else if (next === "offline") {
    next = "online";
  }
  await prisma.agent.update({
    where: { id: agentId },
    data: { status: next, lastSeenAt: next === "offline" ? new Date(0) : new Date() },
  });
  return presenceSnapshot(shop, agentId);
}

export async function listDepartments(shop: string) {
  const rows = await prisma.department.findMany({
    where: { shop },
    orderBy: { name: "asc" },
  });
  return rows.map(formatDepartment);
}

export async function createDepartment(
  shop: string,
  name: string,
  description: string,
) {
  const clean = name.trim();
  if (!clean) throw new ApiError("Department name is required.");
  let slug = slugify(clean);
  const taken = await prisma.department.findFirst({ where: { shop, slug } });
  if (taken) slug = `${slug}-${Date.now().toString(36)}`;
  const row = await prisma.department.create({
    data: { shop, name: clean, slug, description: description.trim() },
  });
  return formatDepartment(row);
}

export async function updateDepartment(
  shop: string,
  id: number,
  name: string,
  description: string,
) {
  const existing = await prisma.department.findFirst({ where: { id, shop } });
  if (!existing) throw new ApiError("Department not found.", 404);
  const row = await prisma.department.update({
    where: { id },
    data: {
      name: name.trim() || existing.name,
      description: description.trim(),
      slug: name.trim() ? slugify(name) : existing.slug,
    },
  });
  return formatDepartment(row);
}

export async function deleteDepartment(shop: string, id: number) {
  const existing = await prisma.department.findFirst({ where: { id, shop } });
  if (!existing) throw new ApiError("Department not found.", 404);
  await prisma.agentDepartment.deleteMany({ where: { shop, departmentId: id } });
  await prisma.department.delete({ where: { id } });
  return { deleted: true, id };
}

export async function assignDepartments(
  shop: string,
  agentId: number,
  departmentIds: number[],
) {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, shop } });
  if (!agent) throw new ApiError("Agent not found.", 404);
  const valid = await prisma.department.findMany({
    where: { shop, id: { in: departmentIds } },
    select: { id: true },
  });
  await prisma.agentDepartment.deleteMany({ where: { shop, agentId } });
  if (valid.length) {
    await prisma.agentDepartment.createMany({
      data: valid.map((row) => ({ shop, agentId, departmentId: row.id })),
    });
  }
  return { id: agentId, departmentIds: valid.map((row) => row.id) };
}

function formatDepartment(row: {
  id: number;
  name: string;
  slug: string;
  description: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    createdAt: iso(row.createdAt),
  };
}

type ConversationRecord = Awaited<ReturnType<typeof prisma.conversation.findFirst>>;

export async function listConversations(shop: string, channel = "", status = "") {
  const rows = await prisma.conversation.findMany({
    where: {
      shop,
      ...(channel ? { channel } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  const contactIds = rows.map((row) => row.contactId).filter((id): id is number => !!id);
  const contacts = contactIds.length
    ? await prisma.contact.findMany({ where: { shop, id: { in: contactIds } } })
    : [];
  const byContact = new Map(contacts.map((contact) => [contact.id, contact]));
  const group = !channel;
  const grouped = new Map<string, ReturnType<typeof formatConversation>>();
  for (const row of rows) {
    const contact = row.contactId ? byContact.get(row.contactId) : undefined;
    const formatted = formatConversation(row, {
      personName: contact?.name,
      personEmail: contact?.email,
      personPhone: contact?.phone,
    });
    const key = group && row.contactId ? `c${row.contactId}` : `r${row.id}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, formatted);
      continue;
    }
    existing.threadIds.push(row.id);
    if (!existing.channels.includes(row.channel)) existing.channels.push(row.channel);
    existing.unreadCount += row.unreadCount;
  }
  return [...grouped.values()];
}

export async function listMessages(shop: string, conversationId: number, afterId = 0) {
  const ids = await conversationIdsForContact(shop, conversationId);
  const rows = await prisma.message.findMany({
    where: {
      shop,
      conversationId: { in: ids },
      ...(afterId > 0 ? { id: { gt: afterId } } : {}),
    },
    orderBy: [{ sentAt: "asc" }, { id: "asc" }],
  });
  const channels = await prisma.conversation.findMany({
    where: { shop, id: { in: ids } },
    select: { id: true, channel: true },
  });
  const channelById = new Map(channels.map((row) => [row.id, row.channel]));
  return rows.map((row) => formatMessage(row, channelById.get(row.conversationId) || row.channel));
}

async function conversationIdsForContact(shop: string, conversationId: number) {
  const row = await prisma.conversation.findFirst({
    where: { id: conversationId, shop },
  });
  if (!row) return [conversationId];
  if (!row.contactId) return [row.id];
  const siblings = await prisma.conversation.findMany({
    where: { shop, contactId: row.contactId },
    select: { id: true },
  });
  return siblings.map((item) => item.id);
}

export async function updateConversation(
  shop: string,
  id: number,
  patch: Record<string, unknown>,
) {
  const existing = await prisma.conversation.findFirst({ where: { id, shop } });
  if (!existing) throw new ApiError("Conversation not found.", 404);
  const data: {
    status?: string;
    priority?: string;
    subject?: string;
    preview?: string;
    assigneeId?: number | null;
    departmentId?: number | null;
    unreadCount?: number;
    aiStatus?: string | null;
  } = {};
  for (const field of ["status", "priority", "subject", "preview"] as const) {
    if (patch[field] != null) data[field] = String(patch[field]);
  }
  if ("assigneeId" in patch) {
    data.assigneeId = patch.assigneeId ? Number(patch.assigneeId) : null;
  }
  if ("departmentId" in patch) {
    data.departmentId = patch.departmentId ? Number(patch.departmentId) : null;
  }
  if ("unreadCount" in patch) data.unreadCount = Math.max(0, Number(patch.unreadCount) || 0);
  if ("aiStatus" in patch) {
    const value = patch.aiStatus;
    data.aiStatus =
      value === "active" || value === "handed_off" ? value : null;
  }
  const markReadOnly = Object.keys(data).length === 1 && "unreadCount" in data;
  const row = await prisma.conversation.update({
    where: { id },
    data: markReadOnly ? data : { ...data, updatedAt: new Date() },
  });
  if (data.unreadCount === 0 && existing.contactId) {
    await prisma.conversation.updateMany({
      where: { shop, contactId: existing.contactId },
      data: { unreadCount: 0 },
    });
  }
  if (data.assigneeId && data.assigneeId !== existing.assigneeId) {
    await notifyAssignment(shop, data.assigneeId, row.id);
  }
  return formatConversation(row);
}

async function notifyAssignment(shop: string, agentId: number, conversationId: number) {
  const settings = await readSettings(shop);
  const notifications = settings.notifications || {};
  if (!notifications.emailAssigned) return;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, shop } });
  if (!agent?.email) return;
  if (notifications.emailAssignedOfflineOnly) {
    const presence = effectivePresence(agent.status, agent.lastSeenAt);
    if (presence === "online") return;
  }
  const email = settings.email || {};
  if (!email.smtpHost || !email.smtpUser) return;
  const { sendMail } = await import("./channels.server");
  await sendMail(email, {
    to: agent.email,
    subject: `A conversation was assigned to you (#${conversationId})`,
    html: `<p>Conversation #${conversationId} is now assigned to you in Kinetix Messaging.</p>`,
  }).catch((error) => {
    console.error("[kinetix] assignment email failed", error);
  });
}

export async function deleteConversation(shop: string, id: number) {
  const existing = await prisma.conversation.findFirst({ where: { id, shop } });
  if (!existing) throw new ApiError("Conversation not found.", 404);
  await prisma.message.deleteMany({ where: { shop, conversationId: id } });
  await prisma.conversation.delete({ where: { id } });
  return { deleted: true, id };
}

export async function deleteMessage(shop: string, id: number) {
  const row = await prisma.message.findFirst({ where: { id, shop } });
  if (!row) throw new ApiError("Message not found.", 404);
  await prisma.message.delete({ where: { id } });
  const latest = await prisma.message.findFirst({
    where: { shop, conversationId: row.conversationId },
    orderBy: { sentAt: "desc" },
  });
  await prisma.conversation.update({
    where: { id: row.conversationId },
    data: { preview: latest ? previewText(latest.body) : "" },
  });
  return { deleted: true, id };
}

export async function createConversation(
  shop: string,
  input: Record<string, unknown>,
) {
  const channel = String(input.channel || "");
  const row = await prisma.conversation.create({
    data: {
      shop,
      channel,
      externalId: String(input.externalId || ""),
      contactName: String(input.contactName || ""),
      contactHandle: String(input.contactHandle || ""),
      subject: String(input.subject || ""),
      preview: String(input.preview || ""),
      status: String(input.status || "open"),
      priority: String(input.priority || "medium"),
      assigneeId: input.assigneeId ? Number(input.assigneeId) : null,
      departmentId: input.departmentId ? Number(input.departmentId) : null,
    },
  });
  return formatConversation(row);
}

export async function addMessage(input: {
  shop: string;
  conversationId: number;
  body: string;
  senderType: string;
  senderId?: number | null;
  senderName: string;
  externalId?: string;
  meta?: Record<string, unknown>;
  channel?: string;
  countUnread?: boolean;
}) {
  if (input.externalId) {
    const existing = await prisma.message.findFirst({
      where: { shop: input.shop, externalId: input.externalId },
    });
    if (existing) return formatMessage(existing, input.channel || "");
  }
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, shop: input.shop },
  });
  if (!conversation) throw new ApiError("Conversation not found.", 404);
  const row = await prisma.message.create({
    data: {
      shop: input.shop,
      conversationId: input.conversationId,
      externalId: input.externalId || "",
      senderType: input.senderType,
      senderId: input.senderId || null,
      senderName: input.senderName,
      body: input.body,
      meta: JSON.stringify(input.meta || {}),
      channel: input.channel || conversation.channel,
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      preview: previewText(input.body),
      lastMessageAt: row.sentAt,
      updatedAt: new Date(),
      unreadCount: input.countUnread
        ? { increment: 1 }
        : conversation.unreadCount,
    },
  });
  return formatMessage(row, input.channel || conversation.channel);
}

export async function poll(shop: string, after = 0) {
  const summary = await prisma.conversation.aggregate({
    where: { shop },
    _max: { updatedAt: true, createdAt: true },
    _sum: { unreadCount: true },
    _count: true,
  });
  const out: Record<string, unknown> = {
    ts: iso(summary._max.updatedAt),
    convTs: iso(summary._max.createdAt),
    unread: summary._sum.unreadCount || 0,
    convCount: summary._count,
  };
  if (after <= 0) {
    const last = await prisma.message.aggregate({
      where: { shop },
      _max: { id: true },
    });
    out.lastMessageId = last._max.id || 0;
    out.inbound = [];
    return out;
  }
  const rows = await prisma.message.findMany({
    where: { shop, id: { gt: after } },
    orderBy: { id: "asc" },
    take: 50,
  });
  const conversationIds = [...new Set(rows.map((row) => row.conversationId))];
  const conversations = await prisma.conversation.findMany({
    where: { shop, id: { in: conversationIds } },
  });
  const byId = new Map(conversations.map((row) => [row.id, row]));
  let last = after;
  const inbound = [];
  for (const message of rows) {
    last = Math.max(last, message.id);
    if (message.senderType !== "contact" && message.senderType !== "customer") continue;
    const conversation = byId.get(message.conversationId);
    inbound.push({
      messageId: message.id,
      conversationId: message.conversationId,
      channel: conversation?.channel || message.channel,
      contactName:
        conversation?.contactName || message.senderName || conversation?.contactHandle || "",
      preview: previewText(message.body),
      assigneeId: conversation?.assigneeId || null,
      aiStatus: conversation?.aiStatus || null,
    });
  }
  out.lastMessageId = last;
  out.inbound = inbound;
  return out;
}

export type InboundMessage = {
  shop: string;
  channel: string;
  externalId: string;
  contactName: string;
  contactHandle: string;
  email?: string;
  phone?: string;
  subject: string;
  body: string;
  messageExternalId?: string;
  meta?: Record<string, unknown>;
};

export async function storeInbound(input: InboundMessage) {
  if (input.messageExternalId) {
    const duplicate = await prisma.message.findFirst({
      where: { shop: input.shop, externalId: input.messageExternalId },
    });
    if (duplicate) {
      return { conversationId: duplicate.conversationId, created: false, first: false };
    }
  }

  let conversation = input.externalId
    ? await prisma.conversation.findFirst({
        where: { shop: input.shop, channel: input.channel, externalId: input.externalId },
        orderBy: { id: "desc" },
      })
    : null;

  const contact = await findOrCreateContact(input);
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        shop: input.shop,
        channel: input.channel,
        externalId: input.externalId,
        contactId: contact?.id || null,
        contactName: contact?.name || input.contactName,
        contactHandle: input.contactHandle,
        contactEmail: input.email || contact?.email || "",
        contactPhone: input.phone || contact?.phone || "",
        subject: input.subject.slice(0, 255),
        preview: previewText(input.body),
        status: "open",
      },
    });
  } else if (contact && !conversation.contactId) {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        contactId: contact.id,
        contactEmail: input.email || conversation.contactEmail,
        contactPhone: input.phone || conversation.contactPhone,
      },
    });
  }

  const prior = await prisma.message.count({
    where: {
      shop: input.shop,
      conversationId: conversation.id,
      senderType: { in: ["contact", "customer"] },
    },
  });

  await addMessage({
    shop: input.shop,
    conversationId: conversation.id,
    body: input.body,
    senderType: "contact",
    senderName: input.contactName,
    externalId: input.messageExternalId,
    meta: input.meta,
    channel: input.channel,
    countUnread: true,
  });

  return { conversationId: conversation.id, created: true, first: prior === 0 };
}

async function findOrCreateContact(input: InboundMessage) {
  const email = (input.email || "").trim().toLowerCase();
  const phone = (input.phone || "").replace(/[^\d+]/g, "");
  const handle = input.contactHandle || input.externalId;
  const existing = email
    ? await prisma.contact.findFirst({ where: { shop: input.shop, email } })
    : phone
      ? await prisma.contact.findFirst({ where: { shop: input.shop, phone } })
      : handle
        ? await prisma.contact.findFirst({ where: { shop: input.shop, handle } })
        : null;
  if (existing) {
    return prisma.contact.update({
      where: { id: existing.id },
      data: {
        name: input.contactName || existing.name,
        email: email || existing.email,
        phone: phone || existing.phone,
        handle: handle || existing.handle,
      },
    });
  }
  if (!email && !phone && !handle) return null;
  return prisma.contact.create({
    data: {
      shop: input.shop,
      name: input.contactName,
      email,
      phone,
      handle,
    },
  });
}

export async function getConversation(shop: string, id: number) {
  return prisma.conversation.findFirst({ where: { id, shop } });
}

export async function onlineAgents(shop: string, departmentId?: number | null) {
  const agents = await prisma.agent.findMany({ where: { shop } });
  const fresh = agents.filter(
    (agent) => effectivePresence(agent.status, agent.lastSeenAt) === "online",
  );
  if (!departmentId) return fresh;
  const links = await prisma.agentDepartment.findMany({
    where: { shop, departmentId, agentId: { in: fresh.map((agent) => agent.id) } },
  });
  const allowed = new Set(links.map((link) => link.agentId));
  const inDepartment = fresh.filter((agent) => allowed.has(agent.id));
  return inDepartment.length ? inDepartment : fresh;
}

export async function customerMessageCount(shop: string, conversationId: number) {
  return prisma.message.count({
    where: {
      shop,
      conversationId,
      senderType: { in: ["contact", "customer"] },
    },
  });
}

function formatConversation(
  row: NonNullable<ConversationRecord>,
  extra: { personName?: string; personEmail?: string; personPhone?: string } = {},
) {
  return {
    id: row.id,
    channel: row.channel,
    externalId: row.externalId,
    contactId: row.contactId || 0,
    contactName: extra.personName || row.contactName,
    contactHandle: row.contactHandle,
    contactPhone: extra.personPhone || row.contactPhone,
    contactEmail: extra.personEmail || row.contactEmail,
    threadIds: [row.id],
    channels: [row.channel],
    subject: row.subject,
    preview: row.preview,
    status: row.status,
    priority: row.priority,
    assigneeId: row.assigneeId,
    departmentId: row.departmentId,
    aiStatus: row.aiStatus,
    unreadCount: row.unreadCount,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    lastMessageAt: iso(row.lastMessageAt),
  };
}

function formatMessage(
  row: {
    id: number;
    conversationId: number;
    externalId: string;
    senderType: string;
    senderId: number | null;
    senderName: string;
    body: string;
    meta: string;
    sentAt: Date;
    channel: string;
  },
  channel: string,
) {
  const meta = parseMeta(row.meta);
  return {
    id: row.id,
    conversationId: row.conversationId,
    externalId: row.externalId,
    senderType: row.senderType,
    senderId: row.senderId,
    senderName: row.senderName,
    body: row.body,
    meta,
    sentAt: iso(row.sentAt),
    isAi: Boolean(meta.ai),
    channel: channel || row.channel,
  };
}

function parseMeta(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
