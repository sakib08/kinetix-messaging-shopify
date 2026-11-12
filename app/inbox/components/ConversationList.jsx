import { useState } from "react";
import Avatar from "./Avatar.jsx";
import ChannelBadge from "./ChannelBadge.jsx";
import SLABadge from "./SLABadge.jsx";
import { channelMeta, STATUS_FILTERS, statusConfig } from "../constants/config";

function ConversationRow({ conversation, selected, setSelected, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    setConfirming(true);
  };

  const handleConfirm = (e) => {
    e.stopPropagation();
    setConfirming(false);
    onDelete(conversation.id);
  };

  const handleCancel = (e) => {
    e.stopPropagation();
    setConfirming(false);
  };

  return (
    <div
      className="relative border-b border-gray-50"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirming(false); }}
    >
      <button
        onClick={() => setSelected(conversation.id)}
        className={`w-full text-left px-4 py-3 transition-all hover:bg-indigo-50/40 ${selected === conversation.id ? "bg-indigo-50 border-l-2 border-l-indigo-500" : ""}`}
      >
        <div className="flex items-start gap-2.5">
          <Avatar initials={conversation.avatar} color={channelMeta(conversation.channel).color || "#6366F1"} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-sm font-semibold text-gray-800 truncate">{conversation.name}</span>
              <span className="text-xs text-gray-400 shrink-0 ml-1">{conversation.time}</span>
            </div>
            <div className="text-xs text-gray-600 font-medium truncate mb-1">{conversation.subject}</div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-gray-400 truncate">{conversation.preview}</span>
              {conversation.unread > 0 && (
                <span className="shrink-0 w-4 h-4 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">
                  {conversation.unread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {(conversation.channels || [conversation.channel]).map((channelId) => (
                <ChannelBadge key={channelId} channelId={channelId} small />
              ))}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusConfig[conversation.status].cls}`}>
                {statusConfig[conversation.status].label}
              </span>
              <SLABadge deadline={conversation.slaDeadline} unit={conversation.slaUnit} />
            </div>
          </div>
        </div>
      </button>

      {/* Delete control — visible on hover */}
      {hovered && !confirming && (
        <button
          onClick={handleDeleteClick}
          title="Delete thread"
          className="absolute top-2 right-2 p-1 rounded-md bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 shadow-sm transition-colors"
        >
          <i className="ti ti-trash" style={{ fontSize: 13 }} />
        </button>
      )}

      {/* Inline confirmation popover */}
      {confirming && (
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-md px-2 py-1 z-10 whitespace-nowrap">
          <span className="text-xs text-gray-600">Delete thread?</span>
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
  );
}

export default function ConversationList({
  activeChannel,
  deleteConversation,
  filterStatus,
  filtered,
  loading,
  search,
  selected,
  setFilterStatus,
  setSearch,
  setSelected,
  setConversations,
  stats,
}) {
  const title = channelMeta(activeChannel).label === "All" ? "Unified Inbox" : channelMeta(activeChannel).label;

  return (
    <div
      className={`min-h-0 min-w-0 bg-white border-r border-gray-100 flex-col shadow-sm ${
        selected ? "flex max-md:hidden" : "flex"
      } flex-1 md:flex-none md:w-80`}
    >
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex flex-col gap-2 mb-3">
          <h1 className="text-sm font-semibold text-gray-800">{title}</h1>
          <div className="flex gap-1 flex-wrap">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`text-xs px-2 py-0.5 rounded-full font-medium transition-all ${filterStatus === status ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
              >
                {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1 mb-3">
          {[
            { label: "Open", val: stats.open, color: "text-blue-600" },
            { label: "Pending", val: stats.pending, color: "text-amber-600" },
            { label: "Resolved", val: stats.resolved, color: "text-green-600" },
            { label: "Unread", val: stats.unread, color: "text-red-600" },
          ].map((stat) => (
            <div key={stat.label} className="bg-gray-50 rounded-lg p-1.5 text-center">
              <div className={`text-base font-bold ${stat.color}`}>{stat.val}</div>
              <div className="text-xs text-gray-400">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="relative">
          <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" style={{ fontSize: 14 }} />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <svg className="animate-spin w-5 h-5 text-indigo-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-sm">Loading…</span>
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <i className="ti ti-inbox-off" style={{ fontSize: 28 }} />
            <span className="text-sm">No conversations</span>
          </div>
        )}
        {!loading && filtered.map((conversation) => (
          <ConversationRow
            key={conversation.id}
            conversation={conversation}
            selected={selected}
            setSelected={setSelected}
            onDelete={deleteConversation}
          />
        ))}
      </div>
    </div>
  );
}
