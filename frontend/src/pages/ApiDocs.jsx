import { Header } from "@/pages/Dashboard";

const EXAMPLE = `curl -X POST \\
  "$BACKEND_URL/api/external/send" \\
  -H "X-API-Key: mk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "template_id": "<email_template_id>",
    "word_template_id": "<optional_word_template_id>",
    "recipients": [
      {
        "email": "alice@example.com",
        "password": "alice_pdf_password",
        "name": "Alice",
        "invoice_number": "INV-001",
        "amount": "1200"
      },
      {
        "email": "bob@example.com",
        "password": "",
        "name": "Bob",
        "invoice_number": "INV-002",
        "amount": "850"
      }
    ]
  }'`;

export default function ApiDocs() {
  return (
    <div className="p-8 lg:p-12 fade-up" data-testid="api-docs-page">
      <Header eyebrow="Reference" title="External API" sub="Trigger campaigns from your own systems using API keys + saved templates." />

      <Section title="Authentication">
        <p>All external endpoints require an <code className="font-mono bg-[#F8F9FA] px-1">X-API-Key</code> header. Generate keys on the API Keys page.</p>
      </Section>

      <Section title="POST /api/external/send">
        <p>Sends personalised emails using a saved email template and optionally a Word→PDF template.</p>
        <ul className="list-disc pl-6 mt-2 text-sm space-y-1 text-[#4B5563]">
          <li><code className="font-mono">template_id</code> — id of an email template (required)</li>
          <li><code className="font-mono">word_template_id</code> — id of a Word template (optional; if provided, a personalised PDF is attached)</li>
          <li><code className="font-mono">recipients</code> — array of objects, each containing at minimum an <code className="font-mono">email</code> field, optional <code className="font-mono">password</code> for PDF encryption, and any custom fields used in placeholders.</li>
        </ul>
        <h3 className="font-heading text-sm uppercase tracking-[0.2em] text-[#9CA3AF] mt-5 mb-2">Example</h3>
        <pre className="bg-[#0a0a0a] text-emerald-300 font-mono text-xs p-5 overflow-x-auto" data-testid="api-example-code">{EXAMPLE}</pre>

        <h3 className="font-heading text-sm uppercase tracking-[0.2em] text-[#9CA3AF] mt-5 mb-2">Response</h3>
        <pre className="bg-[#F8F9FA] border border-[#E2E8F0] font-mono text-xs p-5 overflow-x-auto">{`{
  "campaign_id": "...",
  "total": 2,
  "sent": 2,
  "failed": 0,
  "failures": []
}`}</pre>
      </Section>

      <Section title="Placeholder syntax">
        <p>Placeholders use single braces: <code className="font-mono bg-[#F8F9FA] px-1">{`{field_name}`}</code>. They are replaced in both the email subject + body and inside the Word document.</p>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mt-8 border border-[#E2E8F0] bg-white p-6">
      <h2 className="font-heading text-xl mb-3">{title}</h2>
      <div className="text-sm text-[#4B5563] leading-relaxed">{children}</div>
    </div>
  );
}
