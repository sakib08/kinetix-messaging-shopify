import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import ChannelBadge from "./ChannelBadge.jsx";
import RightPanel from "./RightPanel.jsx";
import { channelMeta, priorityConfig, SAVED_REPLIES, statusConfig } from "../constants/config";

const LIVECHAT_MAX_BYTES = 8 * 1024 * 1024;

function safeHttpUrl(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch (_) {
    return "";
  }
  return "";
}

function livechatFileError(file) {
  if (!file) return "Only images, GIFs, and PDFs can be uploaded.";
  if (!file.size || file.size > LIVECHAT_MAX_BYTES) return "That file is too large.";
  const name = String(file.name || "").toLowerCase();
  const okExt = /\.(jpe?g|png|gif|webp|pdf)$/.test(name);
  const okMime = /^(image\/(jpeg|png|gif|webp)|application\/pdf)$/.test(file.type || "");
  if (!okExt || (file.type && !okMime)) return "Only images, GIFs, and PDFs can be uploaded.";
  return "";
}

function MessageAttachment({ attachment, inverted }) {
  const url = safeHttpUrl(attachment?.url);
  if (!url) return null;
  const isImage = attachment.kind === "image" || attachment.kind === "gif" || String(attachment.mime || "").startsWith("image/");
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={url} alt={attachment.name || ""} className="max-w-full max-h-64 rounded-lg" />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 underline break-all ${inverted ? "text-white" : "text-indigo-600"}`}
    >
      <i className="ti ti-file-type-pdf" style={{ fontSize: 16 }} />
      {attachment.name || "PDF"}
    </a>
  );
}

function MessageBubble({ message, conv, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const avatarInitials = message.isAi ? "AI" : message.isAgent ? "AG" : conv.avatar;
  const avatarColor = message.isAi ? "#8B5CF6" : message.isAgent ? "#6366F1" : (channelMeta(conv.channel).color || "#6366F1");

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    setConfirming(true);
  };

  const handleConfirm = (e) => {
    e.stopPropagation();
    setConfirming(false);
    onDelete(message.id);
  };

  const handleCancel = (e) => {
    e.stopPropagation();
    setConfirming(false);
  };

  return (
    <div
      className={`flex gap-2 sm:gap-3 group min-w-0 ${message.isAgent ? "flex-row-reverse" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirming(false); }}
    >
      <div className="shrink-0">
        <Avatar initials={avatarInitials} color={avatarColor} size={32} />
      </div>
      <div className={`min-w-0 flex flex-col gap-1 ${message.isHtml ? "flex-1" : "max-w-[min(28rem,calc(100%-2.75rem))]"} ${message.isAgent ? "items-end" : "items-start"}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">{message.sender}</span>
          {message.isAi && (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">
              AI
            </span>
          )}
          {message.channel && (conv.channels || []).length > 1 && (
            <ChannelBadge channelId={message.channel} small />
          )}
          <span className="text-xs text-gray-400">{message.time}</span>
        </div>
        <div className="relative min-w-0 w-full">
          <div
            className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
              message.isAi
                ? "bg-violet-600 text-white rounded-tr-sm"
                : message.isAgent
                ? "bg-indigo-600 text-white rounded-tr-sm"
                : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm"
            }`}
          >
            {message.attachment ? (
              <div className="flex flex-col gap-2">
                {message.text ? (
                  <span className="break-words" style={{ whiteSpace: "pre-wrap" }}>{message.text}</span>
                ) : null}
                <MessageAttachment attachment={message.attachment} inverted={!!(message.isAgent || message.isAi)} />
              </div>
            ) : message.isHtml ? (
              <div
                className="kmbp-email-body"
                /* Email HTML has already passed our sanitizer + wp_kses_post on the server */
                dangerouslySetInnerHTML={{ __html: message.text }}
              />
            ) : (
              <span className="break-words" style={{ whiteSpace: "pre-wrap" }}>{message.text}</span>
            )}
          </div>
          {hovered && !confirming && (
            <button
              onClick={handleDeleteClick}
              title="Delete message"
              className={`absolute top-1 ${message.isAgent ? "left-0 -translate-x-full -ml-1" : "right-0 translate-x-full ml-1"} p-1 rounded-md bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 shadow-sm transition-colors`}
            >
              <i className="ti ti-trash" style={{ fontSize: 13 }} />
            </button>
          )}
          {confirming && (
            <div
              className={`absolute top-0 ${message.isAgent ? "right-full mr-2" : "left-full ml-2"} flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-md px-2 py-1 z-10 whitespace-nowrap`}
            >
              <span className="text-xs text-gray-600">Delete?</span>
              <button
                onClick={handleConfirm}
                className="text-xs px-2 py-0.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Yes
              </button>
              <button
                onClick={handleCancel}
                className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
              >
                No
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ConversationView({
  activeTab,
  addNote,
  agents,
  deleteMessage,
  loadingMessages,
  messagesEndRef,
  noteText,
  replyFile,
  replyText,
  selectedConv,
  sendError,
  sendReply,
  sendingReply,
  setActiveTab,
  setNoteText,
  setReplyFile,
  setReplyText,
  setShowSaved,
  showSaved,
  updateAssignee,
  updateStatus,
  onBack,
}) {
  const fileRef = useRef(null);
  const [fileNotice, setFileNotice] = useState("");

  useEffect(() => {
    setFileNotice("");
  }, [selectedConv?.id]);

  const onPickFile = (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const error = livechatFileError(file);
    if (error) {
      setFileNotice(error);
      return;
    }
    setFileNotice("");
    const previewUrl = /^image\//.test(file.type || "") ? URL.createObjectURL(file) : "";
    setReplyFile({ file, previewUrl, uploaded: null });
  };

  if (!selectedConv) {
    return (
      <div className="flex max-md:hidden flex-1 flex-col items-center justify-center bg-gray-50 gap-4 text-gray-400">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center">
          <i className="ti ti-messages text-indigo-400" style={{ fontSize: 32 }} />
        </div>
        <div className="text-center">
          <div className="text-base font-semibold text-gray-600 mb-1">Select a conversation</div>
          <div className="text-sm text-gray-400">Choose from the inbox to start replying</div>
        </div>
      </div>
    );
  }

  const isEmail = selectedConv.channel === "email";
  const isLivechat = selectedConv.channel === "livechat";

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-3 md:px-6 py-3 flex items-center justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="md:hidden shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100"
              aria-label="Back to conversations"
            >
              <i className="ti ti-arrow-left" style={{ fontSize: 18 }} />
            </button>
          )}
          <Avatar
            initials={selectedConv.avatar}
            color={channelMeta(selectedConv.channel).color || "#6366F1"}
            size={40}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 truncate">{selectedConv.name}</span>
              {(selectedConv.channels || [selectedConv.channel]).map((channelId) => (
                <ChannelBadge key={channelId} channelId={channelId} />
              ))}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusConfig[selectedConv.status]?.cls || ""}`}>
                {statusConfig[selectedConv.status]?.label || selectedConv.status}
              </span>
              <span className={`inline-flex max-sm:hidden text-xs px-2 py-0.5 rounded-full font-medium ${priorityConfig[selectedConv.priority]?.bg || ""}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${priorityConfig[selectedConv.priority]?.dot || ""}`} />
                {priorityConfig[selectedConv.priority]?.label || selectedConv.priority}
              </span>
            </div>
            <div className="text-sm text-gray-500 flex items-center gap-2 min-w-0">
              <span className="truncate">{selectedConv.subject}</span>
              {isEmail && selectedConv.contactHandle && (
                <span className="text-gray-400 truncate inline max-sm:hidden">
                  &lt;{selectedConv.contactHandle}&gt;
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            value={selectedConv.status}
            onChange={(e) => updateStatus(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 md:px-3 py-1.5 bg-white outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
          </select>
          <button className="inline-flex max-md:hidden px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            <i className="ti ti-dots mr-1" style={{ fontSize: 14 }} />
            More
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Message thread */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 md:px-6 py-4 space-y-4">
            {loadingMessages ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-400">
                <svg className="animate-spin w-6 h-6 text-indigo-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <span className="text-sm">Loading messages…</span>
              </div>
            ) : selectedConv.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400">
                <i className="ti ti-message-off" style={{ fontSize: 28 }} />
                <span className="text-sm">No messages yet</span>
              </div>
            ) : (
              selectedConv.messages.map((message) => (
                <MessageBubble key={message.id} message={message} conv={selectedConv} onDelete={deleteMessage} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Compose area */}
          <div className="bg-white border-t border-gray-100 px-3 md:px-4 py-3 shrink-0">
            <div className="flex gap-1 mb-2 border-b border-gray-100 pb-2">
              {["reply", "note"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`text-sm px-3 py-1 rounded-lg font-medium transition-all ${
                    activeTab === tab ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  <i className={`ti ${tab === "reply" ? "ti-send" : "ti-note"} mr-1`} style={{ fontSize: 13 }} />
                  {tab === "reply" ? "Reply" : "Internal Note"}
                </button>
              ))}
            </div>

            {activeTab === "reply" && (
              <div>
                {isEmail && selectedConv.contactHandle && (
                  <div className="flex items-center gap-1.5 mb-1.5 text-xs text-gray-400">
                    <i className="ti ti-mail" style={{ fontSize: 12 }} />
                    <span>
                      Sending via SMTP to <span className="font-medium text-gray-600">{selectedConv.contactHandle}</span>
                    </span>
                  </div>
                )}
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply via ${channelMeta(selectedConv.channel).label}…`}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) sendReply(); }}
                  disabled={sendingReply}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 resize-none outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 bg-gray-50 disabled:opacity-60"
                />

                {isLivechat && replyFile?.file && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5">
                    {replyFile.previewUrl ? (
                      <img src={replyFile.previewUrl} alt="" className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <i className="ti ti-file-type-pdf text-gray-500" style={{ fontSize: 18 }} />
                    )}
                    <span className="text-xs text-gray-700 truncate flex-1">{replyFile.file.name}</span>
                    <button
                      type="button"
                      onClick={() => setReplyFile(null)}
                      className="text-gray-400 hover:text-gray-700"
                      aria-label="Remove file"
                      disabled={sendingReply}
                    >
                      <i className="ti ti-x" style={{ fontSize: 14 }} />
                    </button>
                  </div>
                )}

                {(sendError || fileNotice) && (
                  <div className="mt-1 text-xs text-red-600 flex items-center gap-1">
                    <i className="ti ti-alert-circle" style={{ fontSize: 12 }} />
                    {sendError || fileNotice}
                  </div>
                )}

                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <button
                        onClick={() => setShowSaved((v) => !v)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                      >
                        <i className="ti ti-bookmark" style={{ fontSize: 13 }} />
                        Saved Replies
                      </button>
                      {showSaved && (
                        <div className="absolute bottom-8 left-0 bg-white border border-gray-200 rounded-xl shadow-lg w-72 z-20 overflow-hidden">
                          <div className="px-3 py-2 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Saved Replies
                          </div>
                          {SAVED_REPLIES.map((reply) => (
                            <button
                              key={reply.id}
                              onClick={() => { setReplyText(reply.body); setShowSaved(false); }}
                              className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors"
                            >
                              <div className="text-sm font-medium text-gray-800">{reply.title}</div>
                              <div className="text-xs text-gray-500 truncate">{reply.body}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {isLivechat && (
                      <>
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.jpg,.jpeg,.png,.gif,.webp,.pdf"
                          className="hidden"
                          onChange={onPickFile}
                        />
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          disabled={sendingReply}
                          className="text-xs text-gray-500 hover:text-indigo-600 font-medium flex items-center gap-1 disabled:opacity-40"
                        >
                          <i className="ti ti-paperclip" style={{ fontSize: 13 }} />
                          Attach
                        </button>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 inline max-sm:hidden">Ctrl+Enter to send</span>
                    <button
                      onClick={sendReply}
                      disabled={(!replyText.trim() && !replyFile?.file) || sendingReply}
                      className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                    >
                      {sendingReply ? (
                        <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                      ) : (
                        <i className="ti ti-send" style={{ fontSize: 14 }} />
                      )}
                      {sendingReply ? "Sending…" : "Send"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "note" && (
              <div>
                <textarea
                  rows={3}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add an internal note visible only to agents…"
                  className="w-full text-sm border border-amber-200 rounded-xl px-3 py-2 resize-none outline-none focus:ring-2 focus:ring-amber-200 bg-amber-50/60"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={addNote}
                    disabled={!noteText.trim()}
                    className="px-4 py-1.5 bg-amber-500 text-white text-sm rounded-lg font-medium hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                  >
                    <i className="ti ti-note" style={{ fontSize: 14 }} />
                    Add Note
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <RightPanel
          agents={agents}
          selectedConv={selectedConv}
          setActiveTab={setActiveTab}
          setReplyText={setReplyText}
          updateAssignee={updateAssignee}
        />
      </div>
    </div>
  );
}
