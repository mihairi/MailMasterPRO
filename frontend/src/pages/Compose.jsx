import { useEffect, useRef, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import RichTextEditor from "@/components/RichTextEditor";
import { Header } from "@/pages/Dashboard";
import { UploadSimple, Trash, PaperPlaneTilt, CheckCircle, Warning, FloppyDisk } from "@phosphor-icons/react";

export default function Compose() {
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p>Hello {name},</p><p>Your message here.</p>");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [excelFile, setExcelFile] = useState(null);
  const [wordTemplateId, setWordTemplateId] = useState("");
  const [wordTemplates, setWordTemplates] = useState([]);
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [attachmentBasename, setAttachmentBasename] = useState("document");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [saveName, setSaveName] = useState("");
  const xlsxRef = useRef(null);

  const reload = () => {
    api.get("/word-templates").then((r) => setWordTemplates(r.data)).catch(() => {});
    api.get("/email-templates").then((r) => setEmailTemplates(r.data)).catch(() => {});
  };
  useEffect(reload, []);

  const onExcelChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setExcelFile(f);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const { data } = await api.post("/excel/parse", fd);
      setHeaders(data.headers);
      setRows(data.rows);
      setError("");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const loadEmailTemplate = (id) => {
    const t = emailTemplates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setBodyHtml(t.body_html);
    setSaveName(t.name);
    // remount editor by toggling a key
    setEditorKey((k) => k + 1);
  };

  const [editorKey, setEditorKey] = useState(0);

  const saveAsTemplate = async () => {
    if (!saveName.trim()) {
      setError("Please enter a template name.");
      return;
    }
    try {
      await api.post("/email-templates", { name: saveName, subject, body_html: bodyHtml });
      reload();
      setError("");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const sendCampaign = async () => {
    setError("");
    setResult(null);
    if (!excelFile) { setError("Please upload an Excel file."); return; }
    if (!subject.trim()) { setError("Subject is required."); return; }
    const fd = new FormData();
    fd.append("subject", subject);
    fd.append("body_html", bodyHtml);
    fd.append("excel", excelFile);
    if (wordTemplateId) fd.append("word_template_id", wordTemplateId);
    fd.append("attachment_basename", attachmentBasename || "document");
    setSending(true);
    try {
      const { data } = await api.post("/campaigns/send", fd, { timeout: 600000 });
      setResult(data);
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-8 lg:p-12 fade-up" data-testid="compose-page">
      <Header
        eyebrow="Compose Campaign"
        title="New dispatch."
        sub="Upload your Excel recipients, optionally attach a Word template, and personalise the message."
      />

      <div className="grid lg:grid-cols-3 gap-0 mt-8 border border-[#E2E8F0] bg-white">
        {/* Left column: inputs */}
        <div className="lg:col-span-1 border-r border-[#E2E8F0] p-6 space-y-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] mb-2">Step 1 — Recipients</div>
            <label className="block">
              <input
                ref={xlsxRef}
                type="file"
                accept=".xlsx,.xlsm"
                onChange={onExcelChange}
                className="hidden"
                data-testid="excel-file-input"
              />
              <button
                type="button"
                onClick={() => xlsxRef.current?.click()}
                data-testid="upload-excel-button"
                className="w-full border border-[#111827] text-[#111827] py-3 text-sm font-semibold hover:bg-[#111827] hover:text-white transition-colors flex items-center justify-center gap-2"
              >
                <UploadSimple size={16} /> {excelFile ? excelFile.name : "Upload Excel (.xlsx)"}
              </button>
            </label>
            {headers.length > 0 && (
              <div className="mt-3 text-xs text-[#4B5563]">
                Detected <span className="font-semibold text-[#111827]">{rows.length}</span> rows, fields:
                <div className="font-mono text-[11px] mt-1 break-words">{headers.join(", ")}</div>
                <div className="mt-1 text-[10px] text-[#9CA3AF]">
                  Column 1 = recipient email, Column 2 = PDF password (leave empty for no encryption).
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] mb-2">Step 2 — Word template (optional)</div>
            <select
              value={wordTemplateId}
              onChange={(e) => setWordTemplateId(e.target.value)}
              data-testid="word-template-select"
              className="w-full border border-[#E2E8F0] bg-white px-3 py-2 text-sm"
            >
              <option value="">— None (email only) —</option>
              {wordTemplates.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            {wordTemplateId && (
              <div className="mt-3">
                <label className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] block mb-1">PDF attachment name</label>
                <input
                  value={attachmentBasename}
                  onChange={(e) => setAttachmentBasename(e.target.value)}
                  data-testid="attachment-basename-input"
                  className="w-full border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-mono"
                  placeholder="document"
                />
              </div>
            )}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] mb-2">Load email template</div>
            <select
              onChange={(e) => loadEmailTemplate(e.target.value)}
              data-testid="load-email-template-select"
              defaultValue=""
              className="w-full border border-[#E2E8F0] bg-white px-3 py-2 text-sm"
            >
              <option value="" disabled>Select a saved template</option>
              {emailTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        {/* Right column: subject + editor + send */}
        <div className="lg:col-span-2 p-6 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] block mb-2">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              data-testid="subject-input"
              className="w-full border border-[#E2E8F0] bg-white px-3 py-2 text-sm focus:border-[#002FA7] focus:outline-none"
              placeholder="Your invoice {invoice_number}"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] block mb-2">Body (HTML)</label>
            <RichTextEditor key={editorKey} value={bodyHtml} onChange={setBodyHtml} headers={headers} />
            <div className="mt-1 text-[10px] text-[#9CA3AF]">
              Use <span className="font-mono text-[#111827]">{"{field_name}"}</span> placeholders. Click a tag above to insert it.
            </div>
          </div>

          {/* Save template */}
          <div className="border border-[#E2E8F0] bg-[#F8F9FA] p-4 flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] block mb-1">Save current as template</label>
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                data-testid="save-template-name-input"
                placeholder="Template name"
                className="w-full border border-[#E2E8F0] bg-white px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={saveAsTemplate}
              data-testid="save-template-button"
              className="border border-[#111827] text-[#111827] py-2 px-4 text-sm font-semibold hover:bg-[#111827] hover:text-white transition-colors flex items-center gap-2"
            >
              <FloppyDisk size={16} /> Save template
            </button>
          </div>

          {error && (
            <div className="text-sm border border-[#E53E3E] bg-red-50 text-[#E53E3E] px-3 py-2 flex items-start gap-2" data-testid="compose-error">
              <Warning size={16} /> {error}
            </div>
          )}
          {result && (
            <div className="border border-[#10B981] bg-emerald-50 text-emerald-800 px-3 py-3" data-testid="compose-result">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle size={18} /> Campaign sent
              </div>
              <div className="text-sm mt-1">
                Total: <b>{result.total}</b> · Sent: <b>{result.sent}</b> · Failed: <b>{result.failed}</b>
              </div>
              {result.failures && result.failures.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs">Show failures</summary>
                  <ul className="mt-1 text-xs font-mono space-y-1">
                    {result.failures.map((f, i) => <li key={i}>{f.recipient}: {f.error}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}

          <button
            onClick={sendCampaign}
            disabled={sending}
            data-testid="send-campaign-button"
            className="w-full bg-[#002FA7] text-white py-3 font-semibold hover:bg-[#002080] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            <PaperPlaneTilt size={18} weight="fill" />
            {sending ? `Sending to ${rows.length} recipients...` : `Send to ${rows.length || 0} recipient${rows.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      {/* Preview rows */}
      {rows.length > 0 && (
        <div className="mt-10">
          <h2 className="font-heading text-xl mb-3">Recipients preview <span className="text-xs text-[#9CA3AF] font-normal">(first 10)</span></h2>
          <div className="border border-[#E2E8F0] bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-[#111827] text-[10px] uppercase tracking-[0.2em] text-left">
                  {headers.map((h, i) => (
                    <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">
                      {h}{i === 0 ? " (email)" : i === 1 ? " (pdf pw)" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, idx) => (
                  <tr key={idx} className="border-b border-[#E2E8F0]">
                    {headers.map((h, i) => (
                      <td key={h} className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                        {i === 1 ? (r[h] ? "••••••" : <span className="text-[#9CA3AF]">no encryption</span>) : r[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
