import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Header, StatusBadge } from "@/pages/Dashboard";

export default function History() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    api.get("/logs", { params: { limit: 1000 } }).then((r) => setLogs(r.data)).catch(() => {});
  }, []);

  const filtered = logs.filter((l) => {
    if (statusFilter && l.status !== statusFilter) return false;
    if (filter) {
      const q = filter.toLowerCase();
      return (
        l.recipient?.toLowerCase().includes(q) ||
        l.subject?.toLowerCase().includes(q) ||
        l.user_email?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-8 lg:p-12 fade-up" data-testid="history-page">
      <Header eyebrow="Audit" title="Send History" sub="Every dispatch, every attachment, every recipient. Logged." />

      <div className="mt-8 flex gap-3 items-center">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search by recipient, subject or sender..."
          data-testid="history-search-input"
          className="flex-1 border border-[#E2E8F0] bg-white px-3 py-2 text-sm focus:border-[#002FA7] focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          data-testid="history-status-filter"
          className="border border-[#E2E8F0] bg-white px-3 py-2 text-sm"
        >
          <option value="">All status</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
        <div className="text-xs text-[#4B5563] font-mono">{filtered.length} / {logs.length}</div>
      </div>

      <div className="mt-4 border border-[#E2E8F0] bg-white overflow-hidden">
        <table className="w-full text-sm" data-testid="history-table">
          <thead>
            <tr className="border-b-2 border-[#111827] text-[10px] uppercase tracking-[0.2em] text-left">
              <th className="px-4 py-3 font-semibold">Time</th>
              <th className="px-4 py-3 font-semibold">From user</th>
              <th className="px-4 py-3 font-semibold">Recipient</th>
              <th className="px-4 py-3 font-semibold">Subject</th>
              <th className="px-4 py-3 font-semibold">Attachment</th>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan="7" className="p-6 text-center text-[#9CA3AF]">No matching records.</td></tr>
            )}
            {filtered.map((l) => (
              <tr key={l.id} className="border-b border-[#E2E8F0] hover:bg-[#F8F9FA]">
                <td className="px-4 py-3 font-mono text-xs text-[#4B5563]">{new Date(l.timestamp).toLocaleString()}</td>
                <td className="px-4 py-3 text-xs">{l.user_email}</td>
                <td className="px-4 py-3 text-xs">{l.recipient}</td>
                <td className="px-4 py-3 truncate max-w-xs">{l.subject}</td>
                <td className="px-4 py-3 text-xs text-[#4B5563]">{l.attachment_name || "—"}</td>
                <td className="px-4 py-3 text-[10px] uppercase tracking-wider font-semibold text-[#4B5563]">{l.source}</td>
                <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
