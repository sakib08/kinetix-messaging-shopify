import { useCallback, useEffect, useMemo, useState } from "react";
import api, { caps } from "../../api/client.js";
import PresenceDot from "../PresenceDot.jsx";

function Pill({ active, color = "#6366f1", onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={active ? { background: color + "22", borderColor: color + "66", color } : {}}
      className="text-xs font-semibold px-2.5 py-1 rounded-full border border-slate-700 text-slate-600 hover:border-slate-500 transition-all"
    >
      {children}
    </button>
  );
}

export default function TeamSettings() {
  const [departments, setDepartments] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptDesc, setNewDeptDesc] = useState("");
  const [pendingAssign, setPendingAssign] = useState({});

  const canManageDepts = caps?.canManageDepts || caps?.isAdmin;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [depts, ag] = await Promise.all([api.listDepartments(), api.listAgents()]);
      setDepartments(Array.isArray(depts) ? depts : []);
      setAgents(Array.isArray(ag) ? ag : []);
    } catch (err) {
      setError(err.message || "Could not load team data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const deptIndex = useMemo(() => {
    const map = new Map();
    for (const dept of departments) map.set(dept.id, dept);
    return map;
  }, [departments]);

  const handleCreate = async () => {
    if (!newDeptName.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await api.createDepartment({ name: newDeptName.trim(), description: newDeptDesc.trim() });
      setDepartments((previous) => [...previous, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewDeptName("");
      setNewDeptDesc("");
    } catch (err) {
      setError(err.message || "Could not create department");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this department? Agent assignments to it will be removed.")) return;
    setError(null);
    try {
      await api.deleteDepartment(id);
      setDepartments((previous) => previous.filter((dept) => dept.id !== id));
      setAgents((previous) =>
        previous.map((agent) => ({
          ...agent,
          departmentIds: agent.departmentIds.filter((deptId) => deptId !== id),
        }))
      );
    } catch (err) {
      setError(err.message || "Could not delete department");
    }
  };

  const toggleAgentDept = (agentId, deptId) => {
    setAgents((previous) =>
      previous.map((agent) => {
        if (agent.id !== agentId) return agent;
        const has = agent.departmentIds.includes(deptId);
        const nextIds = has
          ? agent.departmentIds.filter((id) => id !== deptId)
          : [...agent.departmentIds, deptId];
        return { ...agent, departmentIds: nextIds };
      })
    );
  };

  const saveAgent = async (agent) => {
    setPendingAssign((previous) => ({ ...previous, [agent.id]: true }));
    setError(null);
    try {
      await api.assignAgentDepts(agent.id, agent.departmentIds);
    } catch (err) {
      setError(err.message || "Could not save assignment");
    } finally {
      setPendingAssign((previous) => {
        const next = { ...previous };
        delete next[agent.id];
        return next;
      });
    }
  };

  return (
    <div className="space-y-10">
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Departments</h2>
            <p className="text-xs text-slate-500 mt-1">Organize agents into teams that conversations can be routed to.</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-xs px-4 py-3">
            {error}
          </div>
        )}

        {canManageDepts && (
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 space-y-3 mb-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Add department</p>
            <div className="flex flex-col md:flex-row gap-2">
              <input
                value={newDeptName}
                onChange={(event) => setNewDeptName(event.target.value)}
                placeholder="Department name (e.g. VIP Support)"
                className="flex-1 rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-indigo-500"
              />
              <input
                value={newDeptDesc}
                onChange={(event) => setNewDeptDesc(event.target.value)}
                placeholder="Optional description"
                className="flex-1 rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleCreate}
                disabled={!newDeptName.trim() || creating}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-indigo-500 to-purple-600 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 overflow-hidden">
          {loading && <p className="text-xs text-slate-400 px-4 py-3">Loading departments…</p>}
          {!loading && departments.length === 0 && (
            <p className="text-xs text-slate-500 px-4 py-3">No departments yet. Add one above.</p>
          )}
          {!loading && departments.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-slate-900/60 border-b border-slate-800/80">
                  <tr>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3">Department</th>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3">Description</th>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3">Assigned Agents</th>
                    <th className="text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {departments.map((dept) => (
                    <tr key={dept.id}>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-100">{dept.name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{dept.description || "No description"}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {agents.filter((agent) => agent.departmentIds.includes(dept.id)).length} agent(s)
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canManageDepts && (
                          <button
                            onClick={() => handleDelete(dept.id)}
                            title="Delete department"
                            className="text-slate-500 hover:text-red-400 text-xs"
                          >
                            <i className="ti ti-trash" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white">Agents</h2>
            <p className="text-xs text-slate-500 mt-1">
              Users with the <code className="text-indigo-300 bg-slate-800/70 px-1 py-0.5 rounded">Messaging Agent</code> role can only access the messaging area. Assign them to one or more departments.
            </p>
          </div>
        </div>

        {loading && <p className="text-xs text-slate-400">Loading agents…</p>}
        {!loading && agents.length === 0 && (
          <p className="text-xs text-slate-500">
            No messaging agents yet. Create a new WordPress user and assign the <strong>Messaging Agent</strong> role.
          </p>
        )}

        {agents.length > 0 && (
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="bg-slate-900/60 border-b border-slate-800/80">
                  <tr>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3">Agent</th>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3">Email</th>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3">Departments</th>
                    <th className="text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {agents.map((agent) => {
                    const isPending = !!pendingAssign[agent.id];
                    return (
                      <tr key={agent.id} className="align-top">
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                            <PresenceDot presence={agent.presence} />
                            {agent.name}
                            {!agent.isAgent && (
                              <span className="ml-2 text-[10px] uppercase tracking-widest text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                                {agent.roles.join(", ")}
                              </span>
                            )}
                          </p>
                          <p className="mt-1 text-[10px] uppercase tracking-widest text-slate-600">
                            {agent.departmentIds.length > 0
                              ? `Member of: ${agent.departmentIds.map((id) => deptIndex.get(id)?.name).filter(Boolean).join(", ")}`
                              : "No department assigned"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">{agent.email}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {departments.length === 0 && (
                              <p className="text-xs text-slate-500">No departments to assign yet.</p>
                            )}
                            {departments.map((dept) => (
                              <Pill
                                key={dept.id}
                                active={agent.departmentIds.includes(dept.id)}
                                onClick={canManageDepts ? () => toggleAgentDept(agent.id, dept.id) : undefined}
                              >
                                {dept.name}
                              </Pill>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canManageDepts && (
                            <button
                              onClick={() => saveAgent(agent)}
                              disabled={isPending}
                              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isPending ? "Saving…" : "Save"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
