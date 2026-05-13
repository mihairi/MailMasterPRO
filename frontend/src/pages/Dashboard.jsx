import { useEffect, useState } from "react";
import api from "@/lib/api";
import { ChartLineUp, CheckCircle, XCircle, EnvelopeSimple, FileText, FileDoc } from "@phosphor-icons/react";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api.get("/stats").then((r) => setStats(r.data)).catch(() => {});
    api.get("/logs", { params: { limit: 10 } }).then((r) => setLogs(r.data)).catch(() => {});
  }, []);

  const kpis = [
    { label: "Total emails", value: stats?.total_emails ?? "—", icon: EnvelopeSimple },
    { label: "Successfully sent", value: stats?.sent ?? "—", icon: CheckCircle, accent: "#10B981" },
    { label: "Failed", value: stats?.failed ?? "—", icon: XCircle, accent: "#E53E3E" },
    { label: "Success rate", value: stats ? `${stats.success_rate.toFixed(1)}%` : "—", icon: ChartLineUp },
    { label: "Email templates", value: stats?.email_templates ?? "—", icon: FileText },
    { label: "Word templates", value: stats?.word_templates ?? "—", icon: FileDoc },
  ];

  return (
    <div className="p-8 lg:p-12 fade-up" data-testid="dashboard-page">
      <Header
        eyebrow="Dispatch Overview"
        title="Dashboard"
        sub="Real-time picture of your campaigns, attachments, and deliveries."
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 border border-[#E2E8F0] bg-white mt-8 fade-up-stagger">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            data-testid={`kpi-${k.label.toLowerCase().replace(/\s+/g, '-')}`}
            className={`p-6 ${i % 3 !== 2 ? "lg:border-r" : ""} ${i < 3 ? "border-b lg:border-b" : ""} ${i < 4 && i % 2 === 0 ? "border-r lg:border-r" : ""} border-[#E2E8F0]`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] mb-2">{k.label}</div>
                <div className="font-display text-3xl text-[#111827]">{k.value}</div>
              </div>
              <k.icon size={20} color={k.accent || "#111827"} weight="regular" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-heading text-xl">Recent activity</h2>
          <a href="/history" className="text-xs uppercase tracking-[0.2em] text-[#002FA7] hover:underline" data-testid="view-all-history">View all →</a>
        </div>
        <div className="border border-[#E2E8F0] bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[#111827] text-[10px] uppercase tracking-[0.2em] text-left">
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">From</th>
                <th className="px-4 py-3 font-semibold">To</th>
                <th className="px-4 py-3 font-semibold">Subject</th>
                <th className="px-4 py-3 font-semibold">Attachment</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan="6" className="p-6 text-center text-[#9CA3AF]">No activity yet — send your first campaign.</td></tr>
              )}
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-[#E2E8F0] hover:bg-[#F8F9FA]">
                  <td className="px-4 py-3 font-mono text-xs text-[#4B5563]">{new Date(l.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3">{l.user_email}</td>
                  <td className="px-4 py-3">{l.recipient}</td>
                  <td className="px-4 py-3 truncate max-w-xs">{l.subject}</td>
                  <td className="px-4 py-3 text-[#4B5563]">{l.attachment_name || "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={l.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function Header({ eyebrow, title, sub, right }) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-[#9CA3AF] mb-2">{eyebrow}</div>
        <h1 className="font-display text-4xl sm:text-5xl text-[#111827] leading-none">{title}</h1>
        {sub && <p className="text-sm text-[#4B5563] mt-3 max-w-2xl">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    sent: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" },
    failed: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700" },
  };
  const s = map[status] || { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700" };
  return (
    <span className={`text-[10px] uppercase tracking-[0.2em] font-semibold border px-2 py-0.5 ${s.bg} ${s.border} ${s.text}`}>
      {status}
    </span>
  );
}
