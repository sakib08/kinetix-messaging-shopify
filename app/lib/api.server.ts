import { ApiError, jsonError } from "./errors.server";
import {
  addMessage,
  assignDepartments,
  createConversation,
  createDepartment,
  deleteConversation,
  deleteDepartment,
  deleteMessage,
  listAgents,
  listConversations,
  listDepartments,
  listMessages,
  poll,
  presenceSnapshot,
  touchPresence,
  updateConversation,
  updateDepartment,
  type AdminClient,
  type AgentRow,
} from "./inbox.server";
import {
  agentSend,
  emailPollStatus,
  pollEmail,
  registerTelegramWebhook,
  registerViberWebhook,
  saveUpload,
  telegramWebhookInfo,
  testChannel,
} from "./channels.server";
import { deleteKb, listKb, reindexKb, saveKb, uploadKbFiles } from "./ai.server";
import { readSettings, saveSettings, scrubSettings, SETTING_KEYS } from "./settings.server";

export async function handleKmbpRequest(
  request: Request,
  path: string,
  ctx: { shop: string; agent: AgentRow; admin: AdminClient },
) {
  try {
    const result = await dispatch(request, path, ctx);
    if (result instanceof Response) return result;
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

async function dispatch(
  request: Request,
  path: string,
  ctx: { shop: string; agent: AgentRow; admin: AdminClient },
) {
  const method = request.method.toUpperCase();
  const parts = path.split("/").filter(Boolean);
  const url = new URL(request.url);
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    if (parts[0] === "ai" && parts[1] === "kb" && parts[2] === "upload") {
      const files = form.getAll("files[]").filter((entry): entry is File => entry instanceof File);
      return uploadKbFiles(ctx.shop, files);
    }
    if (parts[0] === "livechat" && parts[1] === "upload") {
      const file = form.get("file");
      if (!(file instanceof File)) throw new ApiError("Choose a file to upload.");
      return saveUpload(ctx.shop, file);
    }
    throw new ApiError("Unsupported upload.", 404);
  }

  const body = method === "GET" || method === "HEAD" ? {} : await readBody(request);

  if (parts[0] === "settings" && parts.length === 1 && method === "GET") {
    return scrubSettings(await readSettings(ctx.shop));
  }
  if (parts[0] === "settings" && parts.length === 1 && method === "POST") {
    return saveSettings(ctx.shop, body as Record<string, Record<string, unknown>>);
  }
  if (parts[0] === "settings" && parts[1]) {
    if (!SETTING_KEYS.includes(parts[1] as (typeof SETTING_KEYS)[number])) {
      throw new ApiError("Unknown channel.", 404);
    }
    if (method === "GET") {
      const all = scrubSettings(await readSettings(ctx.shop));
      return all[parts[1]] || {};
    }
    const saved = await saveSettings(ctx.shop, { [parts[1]]: body });
    return saved[parts[1]] || {};
  }

  if (parts[0] === "departments" && parts.length === 1 && method === "GET") {
    return listDepartments(ctx.shop);
  }
  if (parts[0] === "departments" && parts.length === 1 && method === "POST") {
    return createDepartment(ctx.shop, String(body.name || ""), String(body.description || ""));
  }
  if (parts[0] === "departments" && parts[1]) {
    const id = Number(parts[1]);
    if (method === "PUT" || method === "PATCH") {
      return updateDepartment(ctx.shop, id, String(body.name || ""), String(body.description || ""));
    }
    if (method === "DELETE") return deleteDepartment(ctx.shop, id);
  }

  if (parts[0] === "agents" && parts.length === 1) return listAgents(ctx.shop);
  if (parts[0] === "agents" && parts[2] === "departments") {
    const ids = Array.isArray(body.departmentIds)
      ? body.departmentIds.map((id) => Number(id))
      : [];
    return assignDepartments(ctx.shop, Number(parts[1]), ids);
  }

  if (parts[0] === "presence" && parts[1] === "offline") {
    return touchPresence(ctx.shop, ctx.agent.id, "offline");
  }
  if (parts[0] === "presence" && method === "GET") return presenceSnapshot(ctx.shop, ctx.agent.id);
  if (parts[0] === "presence") {
    return touchPresence(ctx.shop, ctx.agent.id, body.status ? String(body.status) : undefined);
  }

  if (parts[0] === "poll") {
    return poll(ctx.shop, Number(url.searchParams.get("after") || 0));
  }

  if (parts[0] === "conversations" && parts.length === 1 && method === "GET") {
    return listConversations(
      ctx.shop,
      url.searchParams.get("channel") || "",
      url.searchParams.get("status") || "",
    );
  }
  if (parts[0] === "conversations" && parts.length === 1 && method === "POST") {
    return createConversation(ctx.shop, body);
  }
  if (parts[0] === "conversations" && parts[2] === "messages") {
    return listMessages(ctx.shop, Number(parts[1]), Number(url.searchParams.get("after_id") || 0));
  }
  if (parts[0] === "conversations" && parts[1]) {
    const id = Number(parts[1]);
    if (method === "DELETE") return deleteConversation(ctx.shop, id);
    return updateConversation(ctx.shop, id, body);
  }

  if (parts[0] === "messages" && method === "POST") {
    return addMessage({
      shop: ctx.shop,
      conversationId: Number(body.conversationId),
      body: String(body.body || ""),
      senderType: String(body.senderType || "agent"),
      senderId: ctx.agent.id,
      senderName: String(body.senderName || ctx.agent.name),
      meta: (body.meta as Record<string, unknown>) || {},
    });
  }
  if (parts[0] === "messages" && parts[1] && method === "DELETE") {
    return deleteMessage(ctx.shop, Number(parts[1]));
  }

  if (parts[0] === "ai" && parts[1] === "kb" && parts[2] === "reindex") {
    return reindexKb(ctx.shop, ctx.admin);
  }
  if (parts[0] === "ai" && parts[1] === "kb" && parts.length === 2 && method === "GET") {
    return listKb(ctx.shop);
  }
  if (parts[0] === "ai" && parts[1] === "kb" && parts.length === 2 && method === "POST") {
    return saveKb(ctx.shop, String(body.title || ""), String(body.content || ""), body.id ? Number(body.id) : undefined);
  }
  if (parts[0] === "ai" && parts[1] === "kb" && parts[2] && method === "DELETE") {
    return deleteKb(ctx.shop, Number(parts[2]));
  }

  if (parts[0] === "email" && parts[1] === "send") {
    return agentSend({
      shop: ctx.shop,
      channel: "email",
      conversationId: Number(body.conversationId),
      recipientId: String(body.to || ""),
      text: String(body.body || ""),
      html: String(body.body || ""),
      subject: String(body.subject || ""),
      toName: String(body.toName || ""),
      agentId: ctx.agent.id,
      agentName: ctx.agent.name,
    });
  }
  if (parts[0] === "email" && parts[1] === "poll" && method === "POST") return pollEmail(ctx.shop);
  if (parts[0] === "email" && parts[1] === "poll-status") return emailPollStatus(ctx.shop);
  if (parts[0] === "email" && parts[1] === "test-connection") {
    return testChannel(ctx.shop, "email", body);
  }

  if (parts[1] === "send") {
    return agentSend({
      shop: ctx.shop,
      channel: parts[0],
      conversationId: Number(body.conversationId),
      recipientId: String(body.recipientId || ""),
      text: String(body.text || ""),
      attachmentId: body.attachmentId ? Number(body.attachmentId) : undefined,
      agentId: ctx.agent.id,
      agentName: ctx.agent.name,
    });
  }
  if (parts[1] === "test-connection") return testChannel(ctx.shop, parts[0], body);
  if (parts[0] === "telegram" && parts[1] === "set-webhook") {
    return registerTelegramWebhook(ctx.shop, Boolean(body.dropPendingUpdates));
  }
  if (parts[0] === "telegram" && parts[1] === "webhook-info") return telegramWebhookInfo(ctx.shop);
  if (parts[0] === "viber" && parts[1] === "set-webhook") return registerViberWebhook(ctx.shop);

  throw new ApiError("Not found.", 404);
}

async function readBody(request: Request) {
  const text = await request.text();
  if (!text) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("bad");
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiError("Expected a JSON object.", 400);
  }
}
