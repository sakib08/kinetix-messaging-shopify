import { useContext, useEffect, useRef, useState } from "react";
import { Input, Textarea, Toggle, SectionDivider, Row, InfoBox, Select, SettingsThemeContext } from "./shared.jsx";
import api from "../../api/client.js";

const COLOR = "#6366f1";

const PROVIDER_PRESETS = {
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    chatModel: "gpt-4o-mini",
    embeddingModel: "text-embedding-3-small",
    supportsEmbed: true,
    keyHint: "sk-…",
    helper: "Official OpenAI Chat Completions + Embeddings API.",
  },
  grok: {
    label: "Grok (xAI)",
    baseUrl: "https://api.x.ai/v1",
    chatModel: "grok-3-mini",
    embeddingModel: "",
    supportsEmbed: false,
    keyHint: "xai-…",
    helper: "xAI Grok via OpenAI-compatible API. RAG uses keyword search (no embeddings).",
  },
  claude: {
    label: "Claude (Anthropic)",
    baseUrl: "https://api.anthropic.com",
    chatModel: "claude-sonnet-4-5",
    embeddingModel: "",
    supportsEmbed: false,
    keyHint: "sk-ant-…",
    helper: "Anthropic Messages API. RAG uses keyword search (Claude has no embeddings).",
  },
  gemini: {
    label: "Gemini (Google)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    chatModel: "gemini-2.0-flash",
    embeddingModel: "text-embedding-004",
    supportsEmbed: true,
    keyHint: "AIza…",
    helper: "Google Gemini generateContent + embedContent APIs.",
  },
  openai_compat: {
    label: "OpenAI-compatible (custom)",
    baseUrl: "https://api.openai.com/v1",
    chatModel: "gpt-4o-mini",
    embeddingModel: "text-embedding-3-small",
    supportsEmbed: true,
    keyHint: "API key",
    helper: "Azure OpenAI, Groq, Ollama, Together, Fireworks, and other compatible endpoints.",
  },
};

function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function AiSettings({ cfg, setCfg }) {
  const theme = useContext(SettingsThemeContext);
  const isDark = theme !== "light";
  const S = (key, value) => setCfg({ [key]: value });

  const applyProvider = (provider) => {
    const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.openai;
    setCfg({
      provider,
      baseUrl: preset.baseUrl,
      chatModel: preset.chatModel,
      embeddingModel: preset.embeddingModel,
    });
  };

  const provider = cfg.provider || "openai";
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.openai;
  const showBaseUrl = provider === "openai" || provider === "openai_compat" || provider === "grok";
  const showEmbed = !!preset.supportsEmbed;

  const [docs, setDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [savingDoc, setSavingDoc] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [docError, setDocError] = useState(null);
  const [docOk, setDocOk] = useState(null);
  const [form, setForm] = useState({ id: null, title: "", content: "" });
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const addUploadFiles = (list) => {
    const incoming = Array.from(list || []);
    if (!incoming.length) return;
    setUploadFiles((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (!next.some((item) => `${item.name}:${item.size}:${item.lastModified}` === key)) {
          next.push(file);
        }
      }
      return next.slice(0, 20);
    });
  };

  const uploadDocs = async () => {
    if (uploading || uploadFiles.length === 0) return;
    setUploading(true);
    setDocError(null);
    setDocOk(null);
    try {
      const result = await api.uploadKb(uploadFiles);
      const added = Array.isArray(result?.added) ? result.added.length : 0;
      const failed = Array.isArray(result?.errors) ? result.errors : [];
      if (added) {
        setDocOk(`Indexed ${added} file${added === 1 ? "" : "s"}.`);
      }
      if (failed.length) {
        setDocError(failed.map((item) => `${item.name}: ${item.message}`).join(" "));
      }
      setUploadFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (added) loadDocs();
    } catch (err) {
      setDocError(err.message || "Could not upload those files");
    } finally {
      setUploading(false);
    }
  };

  const loadDocs = () => {
    setLoadingDocs(true);
    api
      .listKb()
      .then((list) => setDocs(Array.isArray(list) ? list : []))
      .catch((err) => setDocError(err.message || "Could not load knowledge base"))
      .finally(() => setLoadingDocs(false));
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const resetForm = () => setForm({ id: null, title: "", content: "" });

  const saveDoc = async () => {
    if (savingDoc) return;
    setSavingDoc(true);
    setDocError(null);
    setDocOk(null);
    try {
      await api.saveKb({
        id: form.id || undefined,
        title: form.title,
        content: form.content,
      });
      setDocOk(form.id ? "Article updated and re-indexed." : "Article added and indexed.");
      resetForm();
      loadDocs();
    } catch (err) {
      setDocError(err.message || "Could not save article");
    } finally {
      setSavingDoc(false);
    }
  };

  const editDoc = (doc) => {
    if (doc.sourceType !== "manual") return;
    setForm({ id: doc.id, title: doc.title || "", content: doc.content || "" });
    setDocOk(null);
    setDocError(null);
  };

  const deleteDoc = async (id) => {
    if (!window.confirm("Delete this knowledge base article?")) return;
    setDocError(null);
    try {
      await api.deleteKb(id);
      if (form.id === id) resetForm();
      loadDocs();
    } catch (err) {
      setDocError(err.message || "Could not delete article");
    }
  };

  const reindex = async () => {
    if (reindexing) return;
    setReindexing(true);
    setDocError(null);
    setDocOk(null);
    try {
      const result = await api.reindexKb();
      const m = result?.manual || {};
      const w = result?.wp || {};
      setDocOk(
        `Re-indexed ${m.indexed || 0} manual article(s)` +
          (cfg.indexWpContent ? ` and ${w.indexed || 0} Shopify product(s)/page(s)` : "") +
          "."
      );
      loadDocs();
    } catch (err) {
      setDocError(err.message || "Reindex failed");
    } finally {
      setReindexing(false);
    }
  };

  const manualDocs = docs.filter((d) => d.sourceType === "manual");
  const wpDocs = docs.filter((d) => d.sourceType === "post" || d.sourceType === "page" || d.sourceType === "product");

  const shell = isDark ? "rounded-2xl border" : "rounded-2xl border shadow-sm";
  const card = `${shell} ${isDark ? "border-slate-700/70 bg-slate-900/70" : "border-slate-200 bg-white"}`;
  const dropZone = `${shell} border-dashed ${
    dragOver
      ? isDark
        ? "border-indigo-400 bg-indigo-500/15"
        : "border-indigo-400 bg-indigo-50"
      : isDark
        ? "border-slate-600 bg-slate-900/70"
        : "border-indigo-200 bg-white"
  }`;
  const label = isDark ? "text-slate-300" : "text-slate-700";
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const quiet = isDark ? "text-slate-500" : "text-slate-400";
  const secondaryBtn = isDark
    ? "border border-slate-600 bg-slate-800/80 text-slate-100 hover:bg-slate-700"
    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
  const primaryBtn = "text-white shadow-sm hover:opacity-95 disabled:shadow-none";
  const primaryIdle = isDark
    ? { background: "#312e81", color: "#a5b4fc" }
    : { background: "#e0e7ff", color: "#6366f1" };
  const primaryReady = { background: "linear-gradient(135deg,#6366f1,#7c3aed)", color: "#fff" };
  const chip = isDark
    ? "border-slate-700 bg-slate-800/80 text-slate-200"
    : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">AI Support</h2>
        <p className="text-sm text-slate-400">
          Enable an AI assistant that greets customers, routes to departments, answers from your knowledge base, and hands off to humans on request.
        </p>
      </div>

      <InfoBox type="tip">
        Choose OpenAI, Grok (xAI), Claude (Anthropic), Gemini (Google), or any OpenAI-compatible endpoint. Add FAQ articles or upload files below, and optionally index Shopify products and pages for RAG answers.
      </InfoBox>

      <SectionDivider label="Enable" />
      <Row
        label="Start conversations with AI"
        desc="When enabled, unassigned inbound chats are handled by the AI until an agent is assigned or the customer asks for a human."
      >
        <Toggle checked={!!cfg.enabled} onChange={(v) => S("enabled", v)} color={COLOR} />
      </Row>

      <SectionDivider label="AI provider" />
      <div className="grid gap-4">
        <Select
          label="Provider"
          value={provider}
          onChange={applyProvider}
          options={Object.entries(PROVIDER_PRESETS).map(([value, p]) => ({
            value,
            label: p.label,
          }))}
          helper={preset.helper}
        />
        {showBaseUrl && (
          <Input
            label="Base URL"
            value={cfg.baseUrl || ""}
            onChange={(v) => S("baseUrl", v)}
            placeholder={preset.baseUrl}
            mono
            helper={
              provider === "openai_compat"
                ? "Full API root including /v1 (e.g. https://api.groq.com/openai/v1)."
                : undefined
            }
          />
        )}
        <Input
          label="API key"
          type="password"
          value={cfg.apiKey || ""}
          onChange={(v) => S("apiKey", v)}
          placeholder={cfg.apiKey_set ? "•••••••• (saved)" : preset.keyHint}
        />
        <div className={`grid gap-4 ${showEmbed ? "sm:grid-cols-2" : ""}`}>
          <Input
            label="Chat model"
            value={cfg.chatModel || ""}
            onChange={(v) => S("chatModel", v)}
            placeholder={preset.chatModel}
            mono
          />
          {showEmbed && (
            <Input
              label="Embedding model"
              value={cfg.embeddingModel || ""}
              onChange={(v) => S("embeddingModel", v)}
              placeholder={preset.embeddingModel}
              mono
            />
          )}
        </div>
        {!showEmbed && (
          <InfoBox type="info">
            {preset.label} does not provide embeddings. Knowledge-base matching uses keyword search; chat answers still use the selected model.
          </InfoBox>
        )}
      </div>

      <SectionDivider label="Messages" />
      <div className="grid gap-4">
        <Input
          label="Assistant display name"
          value={cfg.assistantName || ""}
          onChange={(v) => S("assistantName", v)}
          placeholder="AI Assistant"
        />
        <Textarea
          label="Welcome message"
          value={cfg.welcomeMsg || ""}
          onChange={(v) => S("welcomeMsg", v)}
          rows={3}
          helper="Sent when AI takes over a new conversation."
        />
        <Textarea
          label="Wait-for-agent message"
          value={cfg.waitForAgentMsg || ""}
          onChange={(v) => S("waitForAgentMsg", v)}
          rows={3}
          helper="Sent when the customer asks to talk to a human and AI leaves the chat."
        />
      </div>

      <SectionDivider label="Knowledge base (RAG)" />
      <Row
        label="Index Shopify products and pages"
        desc="Auto-index published content for RAG answers."
      >
        <Toggle checked={!!cfg.indexWpContent} onChange={(v) => S("indexWpContent", v)} color={COLOR} />
      </Row>

      <div
        className={`mt-4 p-4 space-y-3 ${dropZone}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          addUploadFiles(event.dataTransfer.files);
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isDark ? "bg-indigo-500/15 text-indigo-300" : "bg-indigo-50 text-indigo-600"
            }`}
          >
            <i className="ti ti-cloud-upload" style={{ fontSize: 20 }} />
          </div>
          <div>
            <p className={`text-sm font-semibold ${label}`}>Upload files</p>
            <p className={`text-xs leading-relaxed mt-0.5 ${muted}`}>
              Drop several files here, or choose them. Text, Markdown, CSV, HTML, JSON, RTF, DOCX, and PDF each become their own article. Up to 20 files, 8 MB each.
            </p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.xml,.log,.rtf,.docx,.pdf,text/plain,text/html,text/csv,application/json,application/pdf,application/rtf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(event) => {
            addUploadFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} className={`px-4 py-2 rounded-xl text-sm font-semibold ${secondaryBtn}`}>
            Choose files
          </button>
          <button
            type="button"
            disabled={uploading || uploadFiles.length === 0}
            onClick={uploadDocs}
            className={`px-4 py-2 rounded-xl text-sm font-semibold disabled:cursor-not-allowed ${primaryBtn}`}
            style={uploading || uploadFiles.length === 0 ? primaryIdle : primaryReady}
          >
            {uploading ? "Indexing…" : uploadFiles.length ? `Upload ${uploadFiles.length} file${uploadFiles.length === 1 ? "" : "s"}` : "Upload files"}
          </button>
        </div>
        {uploadFiles.length > 0 && (
          <ul className="space-y-1.5">
            {uploadFiles.map((file) => (
              <li key={`${file.name}:${file.size}:${file.lastModified}`} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${chip}`}>
                <i className={`ti ti-file-text ${quiet}`} style={{ fontSize: 14 }} />
                <span className="truncate flex-1 font-medium">{file.name}</span>
                <span className={`shrink-0 ${quiet}`}>{fileSize(file.size)}</span>
                <button
                  type="button"
                  onClick={() => setUploadFiles((prev) => prev.filter((item) => item !== file))}
                  className={`shrink-0 font-medium ${isDark ? "text-slate-400 hover:text-red-300" : "text-slate-400 hover:text-red-600"}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`p-4 space-y-3 mt-4 ${card}`}>
        <p className={`text-sm font-semibold ${label}`}>
          {form.id ? "Edit article" : "Add article"}
        </p>
        <Input
          label="Title"
          value={form.title}
          onChange={(v) => setForm((f) => ({ ...f, title: v }))}
          placeholder="Shipping policy"
        />
        <Textarea
          label="Content"
          value={form.content}
          onChange={(v) => setForm((f) => ({ ...f, content: v }))}
          rows={5}
          placeholder="Paste FAQ or help article text…"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={savingDoc || !form.title.trim() || !form.content.trim()}
            onClick={saveDoc}
            className={`px-4 py-2 rounded-xl text-sm font-semibold disabled:cursor-not-allowed ${primaryBtn}`}
            style={savingDoc || !form.title.trim() || !form.content.trim() ? primaryIdle : primaryReady}
          >
            {savingDoc ? "Saving…" : form.id ? "Update article" : "Add article"}
          </button>
          {form.id && (
            <button type="button" onClick={resetForm} className={`px-4 py-2 rounded-xl text-sm font-semibold ${secondaryBtn}`}>
              Cancel edit
            </button>
          )}
          <button
            type="button"
            disabled={reindexing}
            onClick={reindex}
            className={`px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 ml-auto ${secondaryBtn}`}
          >
            {reindexing ? "Re-indexing…" : "Reindex all"}
          </button>
        </div>
      </div>
      {docError && <p className={`text-xs font-medium ${isDark ? "text-red-300" : "text-red-600"}`}>{docError}</p>}
      {docOk && <p className={`text-xs font-medium ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{docOk}</p>}

      <div className="mt-6 space-y-2">
        <p className={`text-xs font-semibold uppercase tracking-widest ${quiet}`}>
          Manual articles {loadingDocs ? "" : `(${manualDocs.length})`}
        </p>
        {loadingDocs ? (
          <p className={`text-sm ${muted}`}>Loading…</p>
        ) : manualDocs.length === 0 ? (
          <p className={`text-sm ${muted}`}>No manual articles yet.</p>
        ) : (
          <ul className="space-y-2">
            {manualDocs.map((doc) => (
              <li key={doc.id} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${chip}`}>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${isDark ? "text-slate-100" : "text-slate-900"}`}>{doc.title}</p>
                  <p className={`text-xs line-clamp-2 mt-0.5 ${muted}`}>
                    {(doc.content || "").replace(/\s+/g, " ").slice(0, 140)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => editDoc(doc)}
                  className={`text-xs font-semibold shrink-0 ${isDark ? "text-indigo-300 hover:text-indigo-200" : "text-indigo-600 hover:text-indigo-800"}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteDoc(doc.id)}
                  className={`text-xs font-semibold shrink-0 ${isDark ? "text-red-300 hover:text-red-200" : "text-red-600 hover:text-red-800"}`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {cfg.indexWpContent && (
        <div className="mt-6 space-y-2">
          <p className={`text-xs font-semibold uppercase tracking-widest ${quiet}`}>
            Indexed Shopify catalog ({wpDocs.length})
          </p>
          {wpDocs.length === 0 ? (
            <p className={`text-sm ${muted}`}>None yet — click Reindex all after saving settings.</p>
          ) : (
            <ul className={`space-y-1 max-h-48 overflow-y-auto rounded-xl border px-3 py-2 ${chip}`}>
              {wpDocs.map((doc) => (
                <li key={doc.id} className="text-xs flex gap-2 py-1">
                  <span className={`uppercase shrink-0 ${quiet}`}>{doc.sourceType}</span>
                  <span className={`truncate ${label}`}>{doc.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
