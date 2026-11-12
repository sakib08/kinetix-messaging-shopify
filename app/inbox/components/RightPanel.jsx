import ChannelBadge from "./ChannelBadge.jsx";
import SLABadge from "./SLABadge.jsx";
import PresenceDot, { PRESENCE_STYLES } from "./PresenceDot.jsx";
import { priorityConfig, SAVED_REPLIES, statusConfig } from "../constants/config";

export default function RightPanel({ agents, selectedConv, setActiveTab, setReplyText, updateAssignee }) {
  // Build agent options: "Unassigned" + all agents from API.
  const agentOptions = [
    { id: "", name: "Unassigned" },
    ...(agents || []).map((a) => ({
      id: String(a.id),
      name: `${a.name || a.login} · ${(PRESENCE_STYLES[a.presence] || PRESENCE_STYLES.offline).label}`,
    })),
  ];

  const currentValue = selectedConv.assigneeId ? String(selectedConv.assigneeId) : "";
  const currentAgent = (agents || []).find((a) => String(a.id) === currentValue);
  const handle = String(selectedConv.contactHandle || "").trim();
  const emailFromContact = String(selectedConv.contactEmail || "").trim();
  const contactEmail = emailFromContact || (handle.includes("@") ? handle : "");
  const phoneDigits = String(selectedConv.contactPhone || "").replace(/\D/g, "");
  const handleDigits = handle.replace(/\D/g, "");
  const contactPhone = phoneDigits ? `+${phoneDigits}` : "";
  const otherHandle = handle && handle !== contactEmail && handleDigits !== phoneDigits ? handle : "";

  return (
    <div className="flex max-md:hidden w-72 shrink-0 bg-white border-l border-gray-100 flex-col overflow-y-auto">
      {/* Assignee */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          Assignee
          {currentAgent && <PresenceDot presence={currentAgent.presence} />}
        </div>
        <select
          value={currentValue}
          onChange={(e) => updateAssignee(e.target.value || null)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:ring-2 focus:ring-indigo-200"
        >
          {agentOptions.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </div>

      {/* SLA */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">SLA Status</div>
        {selectedConv.slaDeadline === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <i className="ti ti-circle-check" style={{ fontSize: 16 }} />
            Met — conversation resolved
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm text-gray-600">First response due</span>
              <SLABadge deadline={selectedConv.slaDeadline} unit={selectedConv.slaUnit} />
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${
                  selectedConv.slaUnit === "min" && selectedConv.slaDeadline <= 10
                    ? "bg-red-500"
                    : selectedConv.slaUnit === "min" && selectedConv.slaDeadline <= 30
                    ? "bg-amber-500"
                    : "bg-green-500"
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    (selectedConv.slaUnit === "min"
                      ? (60 - selectedConv.slaDeadline) / 60
                      : (8 - selectedConv.slaDeadline) / 8) * 100
                  )}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Details</div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Channel</span>
            <ChannelBadge channelId={selectedConv.channel} small />
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Status</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusConfig[selectedConv.status]?.cls || ""}`}>
              {statusConfig[selectedConv.status]?.label || selectedConv.status}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Priority</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityConfig[selectedConv.priority]?.bg || ""}`}>
              {priorityConfig[selectedConv.priority]?.label || selectedConv.priority}
            </span>
          </div>
          {selectedConv.aiStatus && (
            <div className="flex justify-between items-center">
              <span className="text-gray-500">AI</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  selectedConv.aiStatus === "active"
                    ? "bg-violet-100 text-violet-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {selectedConv.aiStatus === "active" ? "Handling" : "Handed off"}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Messages</span>
            <span className="font-medium text-gray-700">{selectedConv.messages.length}</span>
          </div>
          {contactEmail && (
            <div className="flex justify-between items-center gap-2">
              <span className="text-gray-500 shrink-0">Email</span>
              <span className="text-xs text-gray-700 truncate">{contactEmail}</span>
            </div>
          )}
          {contactPhone && (
            <div className="flex justify-between items-center gap-2">
              <span className="text-gray-500 shrink-0">Phone</span>
              <span className="text-xs text-gray-700 truncate">{contactPhone}</span>
            </div>
          )}
          {otherHandle && (
            <div className="flex justify-between items-center gap-2">
              <span className="text-gray-500 shrink-0">Contact</span>
              <span className="text-xs text-gray-700 truncate">{otherHandle}</span>
            </div>
          )}
        </div>
      </div>

      {/* Internal Notes */}
      <div className="px-4 py-4">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
          <i className="ti ti-note" style={{ fontSize: 13 }} />
          Internal Notes
          {selectedConv.notes.length > 0 && (
            <span className="ml-auto bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full font-bold">
              {selectedConv.notes.length}
            </span>
          )}
        </div>
        {selectedConv.notes.length === 0 && (
          <div className="text-xs text-gray-400 italic">No notes yet. Use the reply area to add one.</div>
        )}
        <div className="space-y-2">
          {selectedConv.notes.map((note, index) => (
            <div key={index} className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs text-amber-900 leading-relaxed">
              <i className="ti ti-lock mr-1 text-amber-400" style={{ fontSize: 11 }} />
              {note}
            </div>
          ))}
        </div>
      </div>

      {/* Quick Replies */}
      <div className="px-4 py-4 border-t border-gray-100">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
          <i className="ti ti-bookmark" style={{ fontSize: 13 }} />
          Quick Replies
        </div>
        <div className="space-y-1">
          {SAVED_REPLIES.map((reply) => (
            <button
              key={reply.id}
              onClick={() => { setReplyText(reply.body); setActiveTab("reply"); }}
              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-indigo-50 transition-colors group"
            >
              <div className="text-xs font-medium text-gray-700 group-hover:text-indigo-700">{reply.title}</div>
              <div className="text-xs text-gray-400 truncate">{reply.body.slice(0, 45)}…</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
