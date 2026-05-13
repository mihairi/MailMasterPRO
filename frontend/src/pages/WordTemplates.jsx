import { useEffect, useRef, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Header } from "@/pages/Dashboard";
import { UploadSimple, Trash, FileDoc } from "@phosphor-icons/react";

export default function WordTemplates() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = () => api.get("/word-templates").then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const upload = async () => {
    setError("");
    if (!file) { setError("Please choose a .docx file."); return; }
    if (!name.trim()) { setError("Please enter a name."); return; }
    const fd = new FormData();
    fd.append("name", name);
    fd.append("file", file);
    setUploading(true);
    try {
      await api.post("/word-templates", fd);
      setName("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this template file?")) return;
    await api.delete(`/word-templates/${id}`);
    load();
  };

  return (
    <div className="p-8 lg:p-12 fade-up" data-testid="word-templates-page">
      <Header
        eyebrow="Library"
        title="Word Templates"
        sub="Upload .docx files with {placeholder} tags. They will be rendered to personalised PDFs at send time."
      />

      <div className="mt-8 border border-[#E2E8F0] bg-white p-6">
        <div className="grid sm:grid-cols-[1fr,1fr,auto] gap-3 items-end">
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] block mb-2">Display name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-[#E2E8F0] px-3 py-2 text-sm" placeholder="Invoice template" data-testid="word-template-name-input" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] block mb-2">File (.docx)</label>
            <input ref={fileRef} type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full border border-[#E2E8F0] px-3 py-2 text-sm" data-testid="word-template-file-input" />
          </div>
          <button onClick={upload} disabled={uploading} data-testid="upload-word-template-button" className="bg-[#002FA7] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#002080] disabled:opacity-60 flex items-center gap-2">
            <UploadSimple size={16} /> {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
        {error && <div className="mt-3 text-sm border border-[#E53E3E] bg-red-50 text-[#E53E3E] px-3 py-2">{error}</div>}
      </div>

      <div className="mt-8 border border-[#E2E8F0] bg-white overflow-hidden">
        <table className="w-full text-sm" data-testid="word-templates-table">
          <thead>
            <tr className="border-b-2 border-[#111827] text-[10px] uppercase tracking-[0.2em] text-left">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Original file</th>
              <th className="px-4 py-3 font-semibold">Uploaded by</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan="5" className="p-6 text-center text-[#9CA3AF]">No templates uploaded yet.</td></tr>}
            {items.map((t) => (
              <tr key={t.id} className="border-b border-[#E2E8F0] hover:bg-[#F8F9FA]">
                <td className="px-4 py-3 font-semibold flex items-center gap-2"><FileDoc size={18} weight="duotone" color="#002FA7" />{t.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-[#4B5563]">{t.original_filename}</td>
                <td className="px-4 py-3 text-xs font-mono text-[#4B5563]">{t.uploaded_by}</td>
                <td className="px-4 py-3 text-xs text-[#4B5563]">{new Date(t.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => remove(t.id)} data-testid={`delete-word-template-${t.id}`} className="p-2 hover:bg-red-50 text-[#E53E3E]"><Trash size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
