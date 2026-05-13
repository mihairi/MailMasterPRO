import { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Header } from "@/pages/Dashboard";
import { Plus, Trash, Copy, Key } from "@phosphor-icons/react";

export default function ApiKeys() {
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState(null);
  const [error, setError] = useState("");

  const load = () => api.get("/api-keys").then((r) => setKeys(r.data)).catch(() => {});
  useEffect(load, []);

  const create = async () => {
    setError("");
    if (!name.trim()) { setError("Name is required"); return; }
    try {
      const { data } = await api.post("/api-keys", { name });
      setCreatedKey(data);
      setName("");
      load();
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const revoke = async (id) => {
    if (!window.confirm("Revoke this API key? External integrations using it will stop working.")) return;
    await api.delete(`/api-keys/${id}`);
    load();
  };

  const copy = (s) => navigator.clipboard.writeText(s);

  return (
    <div className="p-8 lg:p-12 fade-up" data-testid="api-keys-page">
      <Header eyebrow="Integrations" title="API Keys" sub="Generate keys for external programs to trigger campaigns via /api/external/send." />

      <div className="mt-8 border border-[#E2E8F0] bg-white p-6 flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] block mb-2">Key name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="CRM integration" data-testid="new-api-key-name" className="w-full border border-[#E2E8F0] px-3 py-2 text-sm" />
        </div>
        <button onClick={create} data-testid="create-api-key-button" className="bg-[#002FA7] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#002080] flex items-center gap-2">
          <Plus size={16} weight="bold" /> Generate key
        </button>
      </div>
      {error && <div className="mt-3 text-sm border border-[#E53E3E] bg-red-50 text-[#E53E3E] px-3 py-2">{error}</div>}

      {createdKey && (
        <div className="mt-4 bg-[#0a0a0a] text-emerald-300 border border-[#0a0a0a] p-5 fade-up" data-testid="new-key-display">
          <div className="text-[10px] uppercase tracking-[0.3em] text-emerald-500 mb-2">Save this key — it won't be shown again</div>
          <div className="flex items-center gap-3">
            <Key size={18} weight="duotone" />
            <code className="font-mono text-sm break-all flex-1">{createdKey.key}</code>
            <button onClick={() => copy(createdKey.key)} data-testid="copy-new-key" className="border border-emerald-500 text-emerald-300 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-500 hover:text-black flex items-center gap-1">
              <Copy size={14} /> Copy
            </button>
            <button onClick={() => setCreatedKey(null)} className="text-emerald-300 hover:underline text-xs">Dismiss</button>
          </div>
        </div>
      )}

      <div className="mt-8 border border-[#E2E8F0] bg-white overflow-hidden">
        <table className="w-full text-sm" data-testid="api-keys-table">
          <thead>
            <tr className="border-b-2 border-[#111827] text-[10px] uppercase tracking-[0.2em] text-left">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Owner</th>
              <th className="px-4 py-3 font-semibold">Preview</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && <tr><td colSpan="6" className="p-6 text-center text-[#9CA3AF]">No API keys yet.</td></tr>}
            {keys.map((k) => (
              <tr key={k.id} className="border-b border-[#E2E8F0] hover:bg-[#F8F9FA]">
                <td className="px-4 py-3 font-semibold">{k.name}</td>
                <td className="px-4 py-3 text-xs font-mono">{k.owner_email}</td>
                <td className="px-4 py-3 font-mono text-xs">{k.key_preview}</td>
                <td className="px-4 py-3 text-xs text-[#4B5563]">{new Date(k.created_at).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] uppercase tracking-[0.2em] font-semibold border px-2 py-0.5 ${k.revoked ? "border-red-300 text-red-700 bg-red-50" : "border-emerald-300 text-emerald-700 bg-emerald-50"}`}>
                    {k.revoked ? "Revoked" : "Active"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {!k.revoked && (
                    <button onClick={() => revoke(k.id)} data-testid={`revoke-key-${k.id}`} className="p-2 hover:bg-red-50 text-[#E53E3E]"><Trash size={16} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
