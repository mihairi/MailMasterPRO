import { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Header } from "@/pages/Dashboard";
import RichTextEditor from "@/components/RichTextEditor";
import { Plus, Trash, PencilSimple, FloppyDisk, X } from "@phosphor-icons/react";

export default function EmailTemplates() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = () => api.get("/email-templates").then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async (data) => {
    try {
      if (editing?.id) {
        await api.put(`/email-templates/${editing.id}`, data);
      } else {
        await api.post("/email-templates", data);
      }
      setEditing(null);
      setCreating(false);
      load();
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this template?")) return;
    await api.delete(`/email-templates/${id}`);
    load();
  };

  const showEditor = creating || editing;

  return (
    <div className="p-8 lg:p-12 fade-up" data-testid="email-templates-page">
      <Header
        eyebrow="Library"
        title="Email Templates"
        sub="Save and reuse personalised HTML email bodies with merge tags."
        right={
          !showEditor && (
            <button
              onClick={() => { setCreating(true); setEditing({ name: "", subject: "", body_html: "<p>Hello {name},</p>" }); }}
              data-testid="new-email-template-button"
              className="bg-[#002FA7] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#002080] transition-colors flex items-center gap-2"
            >
              <Plus size={16} weight="bold" /> New template
            </button>
          )
        }
      />

      {showEditor ? (
        <Editor
          initial={editing}
          onCancel={() => { setEditing(null); setCreating(false); setError(""); }}
          onSave={save}
          error={error}
        />
      ) : (
        <div className="mt-8 border border-[#E2E8F0] bg-white overflow-hidden">
          <table className="w-full text-sm" data-testid="email-templates-table">
            <thead>
              <tr className="border-b-2 border-[#111827] text-[10px] uppercase tracking-[0.2em] text-left">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Subject</th>
                <th className="px-4 py-3 font-semibold">Created by</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan="5" className="p-6 text-center text-[#9CA3AF]">No templates yet.</td></tr>
              )}
              {items.map((t) => (
                <tr key={t.id} className="border-b border-[#E2E8F0] hover:bg-[#F8F9FA]" data-testid={`email-template-row-${t.id}`}>
                  <td className="px-4 py-3 font-semibold">{t.name}</td>
                  <td className="px-4 py-3 text-[#4B5563]">{t.subject}</td>
                  <td className="px-4 py-3 text-xs font-mono text-[#4B5563]">{t.created_by}</td>
                  <td className="px-4 py-3 text-xs text-[#4B5563]">{new Date(t.updated_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setEditing(t)} data-testid={`edit-email-template-${t.id}`} className="p-2 hover:bg-[#E2E8F0]"><PencilSimple size={16} /></button>
                    <button onClick={() => remove(t.id)} data-testid={`delete-email-template-${t.id}`} className="p-2 hover:bg-red-50 text-[#E53E3E]"><Trash size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Editor({ initial, onSave, onCancel, error }) {
  const [name, setName] = useState(initial?.name || "");
  const [subject, setSubject] = useState(initial?.subject || "");
  const [bodyHtml, setBodyHtml] = useState(initial?.body_html || "");
  return (
    <div className="mt-8 border border-[#E2E8F0] bg-white p-6 space-y-4" data-testid="email-template-editor">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] block mb-2">Template name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-[#E2E8F0] px-3 py-2 text-sm" data-testid="template-name-input" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] block mb-2">Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full border border-[#E2E8F0] px-3 py-2 text-sm" data-testid="template-subject-input" />
        </div>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] block mb-2">Body</label>
        <RichTextEditor value={bodyHtml} onChange={setBodyHtml} headers={[]} />
      </div>
      {error && <div className="text-sm border border-[#E53E3E] bg-red-50 text-[#E53E3E] px-3 py-2">{error}</div>}
      <div className="flex gap-2">
        <button onClick={() => onSave({ name, subject, body_html: bodyHtml })} data-testid="save-template-confirm" className="bg-[#002FA7] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#002080] flex items-center gap-2">
          <FloppyDisk size={16} /> Save
        </button>
        <button onClick={onCancel} data-testid="cancel-template-button" className="border border-[#111827] text-[#111827] px-5 py-2.5 text-sm font-semibold hover:bg-[#111827] hover:text-white flex items-center gap-2">
          <X size={16} /> Cancel
        </button>
      </div>
    </div>
  );
}
