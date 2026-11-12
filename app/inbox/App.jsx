import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConversationList from "./components/ConversationList.jsx";
import ConversationView from "./components/ConversationView.jsx";
import Sidebar from "./components/Sidebar.jsx";
import IntegrationSettings from "./components/settings/Setttings.js";
import { api, currentUser, gmtOffsetHours } from "./api/client.js";
import {
  getNotifyPrefs,
  saveNotifyPrefs,
  playChime,
  relevantForMe,
  showMessageNotification,
} from "./notifications.js";

const PRESENCE_INTERVAL = 60_000; // must stay well under the server's 180 s online window

// ── Data normalisers ─────────────────────────────────────────────────────────

function makeInitials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function parseSiteDate(dateStr) {
  if (!dateStr) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(dateStr);
  if (!match) {
    const fallback = new Date(dateStr);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const offsetMin = Math.round(gmtOffsetHours * 60);
  return new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] || 0),
  ) - offsetMin * 60_000);
}

function relativeTime(dateStr) {
  const date = parseSiteDate(dateStr);
  if (!date) return "";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function formatTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr.replace(" ", "T"));
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const VALID_PRIORITIES = new Set(["high", "medium", "low"]);

export function normaliseConversation(raw) {
  const name = raw.contactName || raw.contactHandle || "Unknown";
  return {
    id: raw.id,
    channel: raw.channel || "email",
    externalId: raw.externalId || "",
    name,
    avatar: makeInitials(name),
    contactHandle: raw.contactHandle || "",
    status: raw.status || "open",
    subject: raw.subject || "(no subject)",
    preview: raw.preview || "",
    time: relativeTime(raw.lastMessageAt || raw.createdAt),
    unread: raw.unreadCount || 0,
    assigneeId: raw.assigneeId || null,
    assignee: "Unassigned",
    departmentId: raw.departmentId || null,
    aiStatus: raw.aiStatus || null,
    priority: VALID_PRIORITIES.has(raw.priority) ? raw.priority : "medium",
    contactId: raw.contactId || 0,
    contactPhone: raw.contactPhone || "",
    contactEmail: raw.contactEmail || "",
    threadIds: Array.isArray(raw.threadIds) && raw.threadIds.length ? raw.threadIds : [raw.id],
    channels: Array.isArray(raw.channels) && raw.channels.length ? raw.channels : [raw.channel || "email"],
    slaDeadline: 0,
    slaUnit: "hr",
    notes: [],
  };
}

function safeHttpUrl(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch (_) {
    return "";
  }
  return "";
}

function attachmentFromMeta(meta) {
  const att = meta && meta.attachment;
  if (!att || typeof att !== "object" || !att.url) return null;
  const url = safeHttpUrl(att.url);
  if (!url) return null;
  return {
    url,
    name: att.name || "",
    mime: att.mime || "",
    kind: att.kind || "",
  };
}

export function normaliseMessage(raw) {
  const body = raw.body || "";
  const attachment = attachmentFromMeta(raw.meta);
  return {
    id: raw.id,
    sender: raw.senderName || "Unknown",
    text: attachment ? String(raw.meta?.caption || "") : body,
    isHtml: !attachment && /<[a-z][\s\S]*>/i.test(body),
    time: formatTime(raw.sentAt),
    isAgent: raw.senderType === "agent",
    isAi: !!(raw.isAi || raw.meta?.ai),
    attachment,
    channel: raw.channel || "",
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function OmnichannelApp() {
  const [activeChannel, setActiveChannel] = useState("all");
  const [conversations, setConversations] = useState([]);
  const [messagesByConvId, setMessagesByConvId] = useState({});
  const [agents, setAgents] = useState([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("reply");
  const [replyText, setReplyText] = useState("");
  const [replyFile, setReplyFileState] = useState(null);
  const setReplyFile = (next) => {
    setReplyFileState((prev) => {
      if (prev?.previewUrl && prev.previewUrl !== next?.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return next;
    });
  };
  const [noteText, setNoteText] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [theme, setTheme] = useState("light");
  const [sendError, setSendError] = useState("");
  const messagesEndRef = useRef(null);
  // Smart-poller refs — stored as refs (not state) to avoid triggering re-renders.
  const pollTimerRef   = useRef(null);
  const lastPollTs     = useRef("");  // MAX(updated_at) seen in last /poll
  const lastPollConvTs = useRef("");  // MAX(created_at) seen in last /poll
  const lastMsgIdRef   = useRef({});  // { [convId]: maxMessageId }
  const lastInboundIdRef = useRef(0); // highest message id already seen, for notifications
  const notifyRef      = useRef(() => {});
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [notifyPrefs, setNotifyPrefsState] = useState(getNotifyPrefs);
  const setNotifyPrefs = useCallback((next) => {
    setNotifyPrefsState(next);
    saveNotifyPrefs(next);
  }, []);

  // ── Load agents once (for assignee selector) ────────────────────────────────
  useEffect(() => {
    api.listAgents().then((data) => setAgents(data || [])).catch(() => {});
  }, []);

  // ── Presence heartbeat ──────────────────────────────────────────────────────
  //  Unlike the poller this keeps running in background tabs, so an agent with
  //  the inbox open in another tab still counts as online for routing.
  const [presence, setPresence] = useState(null);

  const applyPresence = useCallback((snap) => {
    if (!snap) return;
    setPresence(snap);
    const byId = new Map((snap.agents || []).map((a) => [a.id, a.presence]));
    setAgents((prev) => prev.map((a) => (byId.has(a.id) ? { ...a, presence: byId.get(a.id) } : a)));
  }, []);

  useEffect(() => {
    const beat = () => api.sendPresence().then(applyPresence).catch(() => {});
    beat();
    const timer = setInterval(beat, PRESENCE_INTERVAL);
    const onHide = () => api.markOfflineBeacon();
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", onHide);
    };
  }, [applyPresence]);

  const changeMyStatus = useCallback(
    (status) => api.sendPresence(status).then(applyPresence).catch(() => {}),
    [applyPresence]
  );

  // ── Open a conversation from a notification or an email link ──────────────
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const openConversation = useCallback((id) => {
    if (!id) return;
    if (conversationsRef.current.some((c) => c.id === id)) {
      setActiveChannel((current) => (current === "settings" ? "all" : current));
    } else {
      // Not in the current channel filter: switch to "All" so it can load.
      setActiveChannel("all");
    }
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    setSelected(id);
    setSendError("");
  }, []);

  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("conversation"));
    if (id > 0) openConversation(id);
  }, [openConversation]);

  // ── New-message alerts (sound + desktop pop-up) ─────────────────────────────
  notifyRef.current = (items) => {
    const mine = relevantForMe(items, currentUser.id, presence?.me?.status);
    const watching = !document.hidden && document.hasFocus();
    const fresh = mine.filter((item) => !(watching && item.conversationId === selectedRef.current));
    if (!fresh.length) return;

    if (notifyPrefs.sound) playChime();
    if (notifyPrefs.desktop && !watching) {
      // One pop-up per conversation (the newest message), at most three per batch.
      const latest = new Map(fresh.map((item) => [item.conversationId, item]));
      [...latest.values()].slice(-3).forEach((item) => showMessageNotification(item, openConversation));
    }
  };

  // ── Unread count in the browser tab title ──────────────────────────────────
  const baseTitleRef = useRef(typeof document !== "undefined" ? document.title : "");
  useEffect(() => {
    document.title = unreadTotal > 0 ? `(${unreadTotal}) ${baseTitleRef.current}` : baseTitleRef.current;
  }, [unreadTotal]);
  useEffect(() => () => { document.title = baseTitleRef.current; }, []);

  // ── Load conversations ──────────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const params = {};
      if (activeChannel !== "all") params.channel = activeChannel;
      const raw = await api.listConversations(params);
      setConversations((raw || []).map(normaliseConversation));
    } catch (err) {
      console.error("[KMBP] Failed to load conversations:", err);
    } finally {
      setLoadingConvs(false);
    }
  }, [activeChannel]);

  useEffect(() => {
    setLoadingConvs(true);
    loadConversations();
  }, [loadConversations]);

  // ── Smart visibility-aware poller ──────────────────────────────────────────
  //
  //  1. Calls GET /poll every POLL_INTERVAL ms — a couple of indexed queries.
  //  2. Compares ts/convTs to cached values; only fetches full data on change.
  //  3. Fetches only *new* messages (after_id) for the open conversation.
  //  4. Slows to HIDDEN_POLL_INTERVAL in a background tab, so notifications
  //     and the tab-title count keep working without polling at full rate.
  //
  const POLL_INTERVAL = 8_000; // ms between polls when tab is visible
  const HIDDEN_POLL_INTERVAL = 30_000;

  // selectedRef lets the async poll closure see the latest selected conv id
  // without stale closure state — avoids re-creating the interval on every click.
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  useEffect(() => {
    let lastTickAt = 0;

    const onVisibilityChange = () => {
      // Immediately poll when the tab comes back into view.
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const tick = async () => {
      if (document.hidden && Date.now() - lastTickAt < HIDDEN_POLL_INTERVAL - 1000) return;
      lastTickAt = Date.now();
      try {
        const snap = await api.poll(lastInboundIdRef.current);
        setUnreadTotal(snap.unread || 0);
        if (snap.lastMessageId) {
          // The first poll only sets the baseline; older messages never alert.
          if (lastInboundIdRef.current > 0 && snap.inbound?.length) {
            notifyRef.current(snap.inbound);
          }
          lastInboundIdRef.current = snap.lastMessageId;
        }
        const convChanged =
          snap.ts     !== lastPollTs.current ||
          snap.convTs !== lastPollConvTs.current;

        if (convChanged) {
          lastPollTs.current     = snap.ts;
          lastPollConvTs.current = snap.convTs;
          // Refresh full conversation list only when something actually changed.
          await loadConversations();
        }

        // Incremental message fetch for the currently open conversation.
        const openId = selectedRef.current;
        if (openId) {
          const knownMax = lastMsgIdRef.current[openId] || 0;
          if (knownMax > 0 || convChanged) {
            const newMsgs = await api.listNewMessages(openId, knownMax);
            if (newMsgs && newMsgs.length > 0) {
              const normalised = newMsgs.map(normaliseMessage);
              lastMsgIdRef.current[openId] = newMsgs[newMsgs.length - 1].id;
              setMessagesByConvId((prev) => ({
                ...prev,
                [openId]: [...(prev[openId] || []), ...normalised],
              }));
            }
          }
        }
      } catch {
        // Silent — network hiccups are ignored; the next tick will retry.
      }
    };

    pollTimerRef.current = setInterval(tick, POLL_INTERVAL);
    return () => {
      clearInterval(pollTimerRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadConversations]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lazy-load messages when a conversation is opened ───────────────────────
  useEffect(() => {
    if (!selected) return;
    if (messagesByConvId[selected] !== undefined) return; // already cached

    setLoadingMsgs(true);
    api
      .listMessages(selected)
      .then((msgs) => {
        const rows = msgs || [];
        setMessagesByConvId((prev) => ({
          ...prev,
          [selected]: rows.map(normaliseMessage),
        }));
        // Seed the max-id tracker so the poller can do incremental fetches.
        if (rows.length > 0) {
          lastMsgIdRef.current[selected] = rows[rows.length - 1].id;
        }
        // Mark as read.
        api.updateConversation(selected, { unreadCount: 0 }).catch(() => {});
        setConversations((prev) =>
          prev.map((c) => (c.id === selected ? { ...c, unread: 0 } : c))
        );
      })
      .catch((err) => console.error("[KMBP] Failed to load messages:", err))
      .finally(() => setLoadingMsgs(false));
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll to bottom when new messages arrive ──────────────────────────────
  const selectedMessages = messagesByConvId[selected];
  useEffect(() => {
    if (loadingMsgs) return;
    const end = messagesEndRef.current;
    if (!end) return;
    const scroller = end.parentElement;
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }, [selectedMessages?.length, loadingMsgs]);

  // ── Derived conversation (merged with loaded messages + notes) ─────────────
  const selectedConv = useMemo(() => {
    const conv = conversations.find((c) => c.id === selected);
    if (!conv) return null;
    return {
      ...conv,
      messages: messagesByConvId[selected] || [],
    };
  }, [conversations, selected, messagesByConvId]);

  // ── Client-side filtering ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return conversations.filter((c) => {
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q);
    });
  }, [conversations, filterStatus, search]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    open: conversations.filter((c) => c.status === "open").length,
    pending: conversations.filter((c) => c.status === "pending").length,
    resolved: conversations.filter((c) => c.status === "resolved").length,
    unread: conversations.reduce((sum, c) => sum + c.unread, 0),
  }), [conversations]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleSelectConversation = (id) => {
    setSelected(id);
    setSendError("");
    setReplyFile(null);
    // Optimistically clear unread badge.
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c))
    );
  };

  const sendReply = async () => {
    const plainText = replyText.trim();
    const pending = replyFile;
    if ((!plainText && !pending?.file) || !selected || sendingReply) return;
    const conv = conversations.find((c) => c.id === selected);
    if (!conv) return;

    setSendingReply(true);
    setSendError("");

    try {
      let newMsg;
      let uploaded = pending?.uploaded || null;

      if (pending?.file) {
        if (conv.channel !== "livechat") {
          throw new Error("Attach images, GIFs, and PDFs from a live chat conversation.");
        }
        if (!uploaded) {
          uploaded = await api.uploadLivechat(pending.file);
          setReplyFile({ ...pending, uploaded });
        }
      }

      if (conv.channel === "email") {
        // Email: send via SMTP using the email pipe endpoint.
        const result = await api.sendEmail({
          conversationId: selected,
          to: conv.contactHandle,
          toName: conv.name,
          subject: conv.subject.match(/^re:/i) ? conv.subject : `Re: ${conv.subject}`,
          body: `<p>${plainText.replace(/\n/g, "<br>")}</p>`,
        });
        newMsg = {
          id: result.messageId || Date.now(),
          sender: currentUser.name || "You",
          text: `<p>${plainText.replace(/\n/g, "<br>")}</p>`,
          isHtml: true,
          time: "just now",
          isAgent: true,
        };
      } else {
        // All other channels: use the channel-specific send endpoint which
        // both delivers the message via the external API and stores it in DB.
        const payload = {
          conversationId: selected,
          recipientId: conv.externalId || conv.contactHandle,
          text: plainText,
        };
        if (uploaded?.id) payload.attachmentId = uploaded.id;
        const result = await api.sendChannel(conv.channel, payload);
        const attachment = uploaded?.url
          ? {
              url: uploaded.url,
              name: uploaded.name || pending?.file?.name || "",
              mime: uploaded.mime || "",
              kind: uploaded.kind || "",
            }
          : null;
        newMsg = {
          id: result.messageId || Date.now(),
          sender: currentUser.name || "You",
          text: plainText,
          isHtml: false,
          time: "just now",
          isAgent: true,
          attachment,
        };
      }

      const preview = plainText
        || (uploaded?.kind === "pdf" ? "Sent a PDF" : uploaded?.kind === "gif" ? "Sent a GIF" : uploaded ? "Sent an image" : "");

      setMessagesByConvId((prev) => ({
        ...prev,
        [selected]: [...(prev[selected] || []), newMsg],
      }));
      if (newMsg.id) {
        lastMsgIdRef.current[selected] = Math.max(
          lastMsgIdRef.current[selected] || 0,
          Number(newMsg.id) || 0
        );
      }
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selected
            ? { ...c, preview: preview.slice(0, 60), time: "just now" }
            : c
        )
      );
      setReplyText("");
      setReplyFile(null);
    } catch (err) {
      console.error("[KMBP] Send failed:", err);
      setSendError(err.message || "Failed to send. Please try again.");
    } finally {
      setSendingReply(false);
    }
  };

  const addNote = () => {
    if (!noteText.trim() || !selected) return;
    // Notes are local-only (no dedicated notes API yet).
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selected ? { ...c, notes: [...c.notes, noteText.trim()] } : c
      )
    );
    setNoteText("");
  };

  const updateAssignee = async (agentId) => {
    const parsedId = agentId ? Number(agentId) : null;
    const agent = agents.find((a) => a.id === parsedId);
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selected
          ? { ...c, assigneeId: parsedId, assignee: agent ? agent.name : "Unassigned" }
          : c
      )
    );
    try {
      await api.updateConversation(selected, { assigneeId: parsedId });
    } catch (err) {
      console.error("[KMBP] Failed to update assignee:", err);
    }
  };

  const updateStatus = async (status) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === selected ? { ...c, status } : c))
    );
    try {
      await api.updateConversation(selected, { status });
    } catch (err) {
      console.error("[KMBP] Failed to update status:", err);
      loadConversations();
    }
  };

  const deleteConversation = async (convId) => {
    // Optimistic removal from list and deselect if it was open.
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    setMessagesByConvId((prev) => {
      const next = { ...prev };
      delete next[convId];
      return next;
    });
    if (selected === convId) setSelected(null);

    try {
      await api.deleteConversation(convId);
    } catch (err) {
      console.error("[KMBP] Failed to delete conversation:", err);
      // Revert by reloading.
      loadConversations();
    }
  };

  const deleteMessage = async (messageId) => {
    if (!selected) return;
    // Optimistic removal.
    setMessagesByConvId((prev) => ({
      ...prev,
      [selected]: (prev[selected] || []).filter((m) => m.id !== messageId),
    }));
    try {
      await api.deleteMessage(messageId);
    } catch (err) {
      console.error("[KMBP] Failed to delete message:", err);
      // Revert on failure by re-fetching.
      api.listMessages(selected).then((msgs) => {
        setMessagesByConvId((prev) => ({
          ...prev,
          [selected]: (msgs || []).map(normaliseMessage),
        }));
      }).catch(() => {});
    }
  };

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const handleChannelChange = (channelId) => {
    setActiveChannel(channelId);
    setSelected(null);
  };

  const handleBackToList = () => setSelected(null);

  return (
    <div className={`kmbp-app-root theme-${theme} flex bg-gray-50 font-sans overflow-hidden`}>
      <Sidebar
        activeChannel={activeChannel}
        conversations={conversations}
        setActiveChannel={handleChannelChange}
        theme={theme}
        toggleTheme={toggleTheme}
        presence={presence}
        onChangeStatus={changeMyStatus}
        notifyPrefs={notifyPrefs}
        setNotifyPrefs={setNotifyPrefs}
      />

      {activeChannel === "settings" ? (
        <main className="flex-1 overflow-hidden min-w-0">
          <IntegrationSettings theme={theme} toggleTheme={toggleTheme} />
        </main>
      ) : (
        <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
          <ConversationList
            activeChannel={activeChannel}
            deleteConversation={deleteConversation}
            filterStatus={filterStatus}
            filtered={filtered}
            loading={loadingConvs}
            search={search}
            selected={selected}
            setConversations={setConversations}
            setFilterStatus={setFilterStatus}
            setSearch={setSearch}
            setSelected={handleSelectConversation}
            stats={stats}
          />
          <ConversationView
            activeTab={activeTab}
            addNote={addNote}
            agents={agents}
            deleteMessage={deleteMessage}
            loadingMessages={loadingMsgs}
            messagesEndRef={messagesEndRef}
            noteText={noteText}
            onBack={handleBackToList}
            replyText={replyText}
            replyFile={replyFile}
            setReplyFile={setReplyFile}
            selectedConv={selectedConv}
            sendError={sendError}
            sendReply={sendReply}
            sendingReply={sendingReply}
            setActiveTab={setActiveTab}
            setNoteText={setNoteText}
            setReplyText={setReplyText}
            setShowSaved={setShowSaved}
            showSaved={showSaved}
            updateAssignee={updateAssignee}
            updateStatus={updateStatus}
          />
        </div>
      )}
    </div>
  );
}
