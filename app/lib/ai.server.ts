import prisma from "../db.server";
import { ApiError } from "./errors.server";
import { postJson } from "./http.server";
import { addMessage, getConversation, onlineAgents } from "./inbox.server";
import { channelConfig, readSettings } from "./settings.server";
import { deliver, recentHistory } from "./channels.server";

type Cfg = Record<string, unknown>;

const HUMAN =
  /\b(human|real person|talk to (an )?agent|speak to (an )?agent|customer service|representative)\b/i;

export async function handleInbound(input: {
  shop: string;
  conversationId: number;
  channel: string;
  text: string;
  recipientId: string;
  contactName: string;
}) {
  const settings = await readSettings(input.shop);
  const ai = settings.ai || {};
  if (!ai.enabled || !String(input.text || "").trim()) return false;
  const conversation = await getConversation(input.shop, input.conversationId);
  if (!conversation || conversation.aiStatus === "handed_off") return false;
  if (conversation.assigneeId && conversation.aiStatus !== "active") return false;

  const plain = input.text.replace(/<[^>]+>/g, " ").trim();
  if (!conversation.aiStatus) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { aiStatus: "active" },
    });
    const welcome = String(ai.welcomeMsg || "").trim();
    const prior = await prisma.message.count({
      where: {
        shop: input.shop,
        conversationId: conversation.id,
        senderType: { in: ["contact", "customer"] },
      },
    });
    if (welcome && prior <= 1) {
      await sendAi(input, welcome, String(ai.assistantName || "AI Assistant"));
    }
  }

  if (HUMAN.test(plain)) {
    await handoff(input, ai);
    return true;
  }

  const department = await matchDepartment(input.shop, plain);
  const agents = await onlineAgents(input.shop, department?.id);
  if (department && agents.length && looksLikeRouting(plain, department.name)) {
    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: { departmentId: department.id, assigneeId: agents[0].id, aiStatus: "handed_off" },
    });
    const wait = String(ai.waitForAgentMsg || "I'm connecting you with a teammate.");
    await sendAi(input, wait, String(ai.assistantName || "AI Assistant"));
    return true;
  }

  const answer = await answerFromKnowledge(input.shop, ai, plain, input.conversationId);
  await sendAi(input, answer, String(ai.assistantName || "AI Assistant"));
  return true;
}

async function handoff(
  input: { shop: string; conversationId: number; channel: string; recipientId: string },
  ai: Cfg,
) {
  const agents = await onlineAgents(input.shop);
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: {
      aiStatus: "handed_off",
      assigneeId: agents[0]?.id || null,
    },
  });
  const wait = String(
    ai.waitForAgentMsg || "No problem — I'm connecting you with a human agent.",
  );
  await sendAi(input, wait, String(ai.assistantName || "AI Assistant"));
}

async function sendAi(
  input: { shop: string; conversationId: number; channel: string; recipientId: string },
  text: string,
  senderName: string,
) {
  const cfg = await channelConfig(input.shop, input.channel);
  await deliver(input.channel, input.recipientId, text, cfg, {
    subject: "Re: your message",
    html: `<p>${text.replace(/\n/g, "<br>")}</p>`,
  }).catch((error) => {
    console.error("[kinetix] AI delivery failed", error);
  });
  await addMessage({
    shop: input.shop,
    conversationId: input.conversationId,
    body: text,
    senderType: "agent",
    senderName,
    channel: input.channel,
    meta: { ai: true },
  });
}

async function matchDepartment(shop: string, text: string) {
  const departments = await prisma.department.findMany({ where: { shop } });
  const haystack = text.toLowerCase();
  return (
    departments.find(
      (department) =>
        haystack.includes(department.slug) || haystack.includes(department.name.toLowerCase()),
    ) || null
  );
}

function looksLikeRouting(text: string, departmentName: string) {
  return new RegExp(`\\b(talk to|speak to|connect me|${departmentName})\\b`, "i").test(text);
}

export async function answerFromKnowledge(
  shop: string,
  ai: Cfg,
  question: string,
  conversationId: number,
) {
  const chunks = await prisma.kbChunk.findMany({
    where: { shop },
    take: 400,
  });
  const ranked = rankChunks(question, chunks, ai);
  const context = ranked
    .slice(0, 4)
    .map((chunk) => chunk.content)
    .join("\n\n");
  if (!String(ai.apiKey || "")) {
    if (!context) {
      return "I'm not sure about that yet. Would you like me to connect you with a human agent?";
    }
    return context.slice(0, 700);
  }
  const history = await recentHistory(shop, conversationId);
  const messages = [
    {
      role: "system",
      content:
        `You are ${ai.assistantName || "the shop assistant"} for a Shopify store. ` +
        "Answer from the knowledge below. If it does not contain the answer, say so and offer a human. Keep replies short.\n\n" +
        (context || "(no knowledge base articles yet)"),
    },
    ...history,
    { role: "user", content: question },
  ];
  try {
    return await chat(ai, messages);
  } catch (error) {
    console.error("[kinetix] AI chat failed", error);
    return context
      ? context.slice(0, 700)
      : "I'm not sure about that yet. Would you like me to connect you with a human agent?";
  }
}

function rankChunks(
  question: string,
  chunks: { content: string; embedding: string }[],
  ai: Cfg,
) {
  const terms = question.toLowerCase().split(/\W+/).filter((term) => term.length > 2);
  return chunks
    .map((chunk) => {
      const haystack = chunk.content.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0 || chunk.embedding)
    .sort((a, b) => b.score - a.score);
  void ai;
}

async function chat(ai: Cfg, messages: { role: string; content: string }[]) {
  const provider = String(ai.provider || "openai");
  if (provider === "claude") return chatClaude(ai, messages);
  if (provider === "gemini") return chatGemini(ai, messages);
  return chatOpenAI(ai, messages);
}

async function chatOpenAI(ai: Cfg, messages: { role: string; content: string }[]) {
  const base = String(ai.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const data = await postJson(
    `${base}/chat/completions`,
    { model: String(ai.chatModel || "gpt-4o-mini"), messages, temperature: 0.3 },
    { Authorization: `Bearer ${ai.apiKey}` },
  );
  const choices = data.choices as { message?: { content?: string } }[] | undefined;
  const text = choices?.[0]?.message?.content || "";
  if (!text.trim()) throw new ApiError("The AI provider returned an empty reply.", 502);
  return text.trim();
}

async function chatClaude(ai: Cfg, messages: { role: string; content: string }[]) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    }));
  const base = String(ai.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
  const data = await postJson(
    `${base}/v1/messages`,
    {
      model: String(ai.chatModel || "claude-sonnet-4-5"),
      max_tokens: 800,
      system,
      messages: contents,
    },
    {
      "x-api-key": String(ai.apiKey || ""),
      "anthropic-version": "2023-06-01",
    },
  );
  const blocks = data.content as { type?: string; text?: string }[] | undefined;
  const text = (blocks || []).filter((block) => block.type === "text").map((block) => block.text || "").join("");
  if (!text.trim()) throw new ApiError("Claude returned an empty reply.", 502);
  return text.trim();
}

async function chatGemini(ai: Cfg, messages: { role: string; content: string }[]) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
  const base = String(ai.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
  const model = String(ai.chatModel || "gemini-2.0-flash");
  const data = await postJson(
    `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(String(ai.apiKey || ""))}`,
    {
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
    },
  );
  const candidates = data.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined;
  const text = candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text.trim()) throw new ApiError("Gemini returned an empty reply.", 502);
  return text.trim();
}

export async function listKb(shop: string) {
  const docs = await prisma.kbDocument.findMany({
    where: { shop },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  return docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    sourceType: doc.sourceType,
    sourceId: null,
    content: doc.content,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }));
}

export async function saveKb(shop: string, title: string, content: string, id?: number) {
  if (!title.trim() || !content.trim()) throw new ApiError("Title and content are required.");
  if (id) {
    const existing = await prisma.kbDocument.findFirst({ where: { id, shop } });
    if (!existing) throw new ApiError("Document not found.", 404);
  }
  const doc = id
    ? await prisma.kbDocument.update({
        where: { id },
        data: { title: title.trim(), content },
      })
    : await prisma.kbDocument.create({
        data: { shop, title: title.trim(), content, sourceType: "manual" },
      });
  await indexDocument(shop, doc.id, content);
  return {
    id: doc.id,
    title: doc.title,
    sourceType: doc.sourceType,
    content: doc.content,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function deleteKb(shop: string, id: number) {
  const doc = await prisma.kbDocument.findFirst({ where: { id, shop } });
  if (!doc) throw new ApiError("Document not found.", 404);
  await prisma.kbChunk.deleteMany({ where: { shop, documentId: id } });
  await prisma.kbDocument.delete({ where: { id } });
  return { deleted: true, id };
}

export async function reindexKb(
  shop: string,
  admin?: { graphql: (query: string) => Promise<Response> },
) {
  const manuals = await prisma.kbDocument.findMany({
    where: { shop, sourceType: "manual" },
  });
  let manualIndexed = 0;
  let manualErrors = 0;
  for (const doc of manuals) {
    try {
      await indexDocument(shop, doc.id, doc.content);
      manualIndexed += 1;
    } catch {
      manualErrors += 1;
    }
  }
  const settings = await readSettings(shop);
  let catalog = 0;
  let catalogErrors = 0;
  if (settings.ai?.indexWpContent && admin) {
    const result = await indexCatalog(shop, admin);
    catalog = result.indexed;
    catalogErrors = result.errors;
  }
  return {
    manual: { indexed: manualIndexed, errors: manualErrors },
    wp: { indexed: catalog, errors: catalogErrors },
  };
}

async function indexCatalog(
  shop: string,
  admin: { graphql: (query: string) => Promise<Response> },
) {
  const response = await admin.graphql(`#graphql
    query CatalogKnowledge {
      products(first: 50) { nodes { id title description } }
      pages(first: 50) { nodes { id title body } }
    }
  `);
  const payload = (await response.json()) as {
    data?: {
      products?: { nodes?: { id: string; title: string; description?: string }[] };
      pages?: { nodes?: { id: string; title: string; body?: string }[] };
    };
  };
  await prisma.kbDocument.deleteMany({
    where: { shop, sourceType: { in: ["product", "page"] } },
  });
  let indexed = 0;
  let errors = 0;
  const items = [
    ...(payload.data?.products?.nodes || []).map((node) => ({
      sourceType: "product",
      sourceKey: node.id,
      title: node.title,
      content: `${node.title}\n${node.description || ""}`,
    })),
    ...(payload.data?.pages?.nodes || []).map((node) => ({
      sourceType: "page",
      sourceKey: node.id,
      title: node.title,
      content: `${node.title}\n${stripHtml(node.body || "")}`,
    })),
  ];
  for (const item of items) {
    if (!item.content.trim()) continue;
    try {
      const doc = await prisma.kbDocument.create({
        data: {
          shop,
          title: item.title,
          content: item.content,
          sourceType: item.sourceType,
          sourceKey: item.sourceKey,
        },
      });
      await indexDocument(shop, doc.id, item.content);
      indexed += 1;
    } catch {
      errors += 1;
    }
  }
  return { indexed, errors };
}

export async function uploadKbFiles(shop: string, files: File[]) {
  const added = [];
  const errors: { name: string; message: string }[] = [];
  for (const file of files) {
    try {
      const text = (await file.text()).trim();
      if (!text) throw new Error("File is empty");
      const title = file.name.replace(/\.[^.]+$/, "");
      const doc = await saveKb(shop, title, text);
      added.push(doc);
    } catch (error) {
      errors.push({
        name: file.name,
        message: error instanceof Error ? error.message : "Could not index file",
      });
    }
  }
  return { added, errors };
}

async function indexDocument(shop: string, documentId: number, content: string) {
  await prisma.kbChunk.deleteMany({ where: { shop, documentId } });
  const pieces = chunkText(content);
  if (!pieces.length) return;
  await prisma.kbChunk.createMany({
    data: pieces.map((piece, index) => ({
      shop,
      documentId,
      chunkIndex: index,
      content: piece,
      embedding: "",
    })),
  });
}

function chunkText(content: string) {
  const clean = content.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const size = 800;
  const chunks = [];
  for (let index = 0; index < clean.length; index += size) {
    chunks.push(clean.slice(index, index + size));
  }
  return chunks;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
