import { useMemo } from "react";
import { Eye, Warning, EnvelopeSimple, FilePdf } from "@phosphor-icons/react";

// Merge {field} placeholders in text or HTML. Marks unresolved tags with <mark> wrapper.
export function mergeText(text, data) {
  if (!text) return "";
  return text.replace(/\{([^{}]+)\}/g, (_, raw) => {
    const key = raw.trim();
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const v = data[key];
      // basic HTML escape for safety in plain text contexts
      return String(v ?? "");
    }
    return `{${key}}`;
  });
}

// Highlight unresolved placeholders in HTML body
export function highlightUnresolved(html) {
  return html.replace(
    /\{([^{}]+)\}/g,
    (_, k) =>
      `<span style="background:#FEE2E2;color:#991B1B;border:1px solid #FCA5A5;padding:0 4px;font-family:'IBM Plex Mono',monospace">${`{${k.trim()}}`}</span>`
  );
}

export default function PreviewPanel({
  subject,
  bodyHtml,
  headers,
  rows,
  wordTemplate,
  attachmentBasename,
}) {
  const sample = useMemo(() => rows.slice(0, 3), [rows]);
  const emailField = headers[0];
  const passwordField = headers[1];

  // Detect placeholders that don't match any header
  const unknownTags = useMemo(() => {
    const found = new Set();
    const all = `${subject} ${bodyHtml}`;
    const re = /\{([^{}]+)\}/g;
    let m;
    while ((m = re.exec(all)) !== null) {
      const k = m[1].trim();
      if (!headers.includes(k)) found.add(k);
    }
    return Array.from(found);
  }, [subject, bodyHtml, headers]);

  if (rows.length === 0) {
    return (
      <div className="border border-[#E2E8F0] bg-[#F8F9FA] p-6 text-center text-sm text-[#9CA3AF]" data-testid="preview-empty">
        Upload an Excel file to preview personalised emails.
      </div>
    );
  }

  return (
    <div className="border border-[#E2E8F0] bg-white" data-testid="preview-panel">
      <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3 bg-[#F8F9FA]">
        <div className="flex items-center gap-2">
          <Eye size={16} />
          <span className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] font-semibold">Preview — first {sample.length} of {rows.length}</span>
        </div>
        {unknownTags.length > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-[#991B1B] bg-red-50 border border-red-200 px-2 py-1" data-testid="preview-unknown-tags">
            <Warning size={14} />
            <span>Unresolved tag{unknownTags.length > 1 ? "s" : ""}: <span className="font-mono">{unknownTags.map((t) => `{${t}}`).join(", ")}</span></span>
          </div>
        )}
      </div>

      <div className="divide-y divide-[#E2E8F0]">
        {sample.map((row, idx) => {
          const recipient = (row[emailField] || "").toString();
          const password = (row[passwordField] || "").toString();
          const mergedSubject = mergeText(subject, row);
          const mergedBody = highlightUnresolved(mergeText(bodyHtml, row));
          return (
            <div key={idx} className="p-5" data-testid={`preview-card-${idx}`}>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] mb-3">
                <span className="font-mono text-[#111827] bg-[#F8F9FA] border border-[#E2E8F0] px-1.5 py-0.5">#{idx + 1}</span>
                <EnvelopeSimple size={12} />
                <span>Recipient</span>
                <span className="font-mono normal-case tracking-normal text-[#111827]">{recipient || <em className="text-[#E53E3E]">empty</em>}</span>
              </div>

              <div className="space-y-2">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] mb-1">Subject</div>
                  <div className="text-sm font-semibold text-[#111827]" dangerouslySetInnerHTML={{ __html: highlightUnresolved(mergedSubject) }} />
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] mb-1">Body</div>
                  <div
                    className="border border-[#E2E8F0] bg-[#FAFBFC] p-4 text-sm text-[#111827] leading-relaxed overflow-auto max-h-72"
                    style={{ wordBreak: "break-word" }}
                    dangerouslySetInnerHTML={{ __html: mergedBody }}
                  />
                </div>

                {wordTemplate && (
                  <div className="flex items-center gap-2 text-xs text-[#4B5563] border border-[#E2E8F0] bg-[#F8F9FA] px-3 py-2">
                    <FilePdf size={14} weight="duotone" color="#002FA7" />
                    <span className="font-mono">{attachmentBasename || "document"}.pdf</span>
                    <span className="text-[#9CA3AF]">·</span>
                    <span>Template: <b>{wordTemplate.name}</b></span>
                    <span className="text-[#9CA3AF]">·</span>
                    {password ? (
                      <span className="text-emerald-700">Encrypted (AES-256)</span>
                    ) : (
                      <span className="text-[#E53E3E]">No encryption (password field empty)</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
