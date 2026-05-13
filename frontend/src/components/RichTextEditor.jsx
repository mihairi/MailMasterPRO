import { useRef } from "react";
import {
  TextB, TextItalic, TextUnderline, TextAlignLeft, TextAlignCenter,
  TextAlignRight, TextAlignJustify, ListBullets, ListNumbers, Image as ImageIcon,
  LinkSimple, TextHOne, TextHTwo,
} from "@phosphor-icons/react";

const FONT_SIZES = [
  { v: "1", label: "10px" }, { v: "2", label: "13px" }, { v: "3", label: "16px" },
  { v: "4", label: "18px" }, { v: "5", label: "24px" }, { v: "6", label: "32px" }, { v: "7", label: "48px" },
];

const FONT_FAMILIES = [
  "Inter", "Arial", "Helvetica", "Georgia", "Times New Roman", "Courier New", "Verdana", "Tahoma",
];

export default function RichTextEditor({ value, onChange, headers = [] }) {
  const ref = useRef(null);
  const fileRef = useRef(null);

  // Initialize content once
  const initialized = useRef(false);
  if (ref.current && !initialized.current) {
    ref.current.innerHTML = value || "";
    initialized.current = true;
  }

  const exec = (cmd, arg = null) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(ref.current?.innerHTML || "");
  };

  const onInput = () => {
    onChange(ref.current?.innerHTML || "");
  };

  const insertImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      exec("insertImage", reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const insertMergeTag = (tag) => {
    exec("insertHTML", `<span style="font-family:'IBM Plex Mono',monospace;background:#EEF2FF;color:#002FA7;padding:0 4px;border:1px solid #DBE3FF">{${tag}}</span>&nbsp;`);
  };

  const insertLink = () => {
    const url = window.prompt("URL");
    if (url) exec("createLink", url);
  };

  return (
    <div className="border border-[#E2E8F0] bg-white" data-testid="rich-text-editor">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-[#E2E8F0] bg-[#F8F9FA] p-2">
        <select
          onChange={(e) => exec("fontName", e.target.value)}
          defaultValue=""
          data-testid="font-family-select"
          className="text-xs border border-[#E2E8F0] bg-white px-2 py-1 h-8"
        >
          <option value="" disabled>Font</option>
          {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select
          onChange={(e) => exec("fontSize", e.target.value)}
          defaultValue=""
          data-testid="font-size-select"
          className="text-xs border border-[#E2E8F0] bg-white px-2 py-1 h-8"
        >
          <option value="" disabled>Size</option>
          {FONT_SIZES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
        <div className="w-px h-6 bg-[#E2E8F0] mx-1" />
        <ToolButton onClick={() => exec("formatBlock", "<h1>")} icon={<TextHOne size={16} />} title="H1" testid="h1-btn" />
        <ToolButton onClick={() => exec("formatBlock", "<h2>")} icon={<TextHTwo size={16} />} title="H2" testid="h2-btn" />
        <ToolButton onClick={() => exec("bold")} icon={<TextB size={16} weight="bold" />} title="Bold" testid="bold-btn" />
        <ToolButton onClick={() => exec("italic")} icon={<TextItalic size={16} />} title="Italic" testid="italic-btn" />
        <ToolButton onClick={() => exec("underline")} icon={<TextUnderline size={16} />} title="Underline" testid="underline-btn" />
        <div className="w-px h-6 bg-[#E2E8F0] mx-1" />
        <ToolButton onClick={() => exec("justifyLeft")} icon={<TextAlignLeft size={16} />} title="Left" testid="align-left-btn" />
        <ToolButton onClick={() => exec("justifyCenter")} icon={<TextAlignCenter size={16} />} title="Center" testid="align-center-btn" />
        <ToolButton onClick={() => exec("justifyRight")} icon={<TextAlignRight size={16} />} title="Right" testid="align-right-btn" />
        <ToolButton onClick={() => exec("justifyFull")} icon={<TextAlignJustify size={16} />} title="Justify" testid="align-justify-btn" />
        <div className="w-px h-6 bg-[#E2E8F0] mx-1" />
        <ToolButton onClick={() => exec("insertUnorderedList")} icon={<ListBullets size={16} />} title="Bullets" testid="bullets-btn" />
        <ToolButton onClick={() => exec("insertOrderedList")} icon={<ListNumbers size={16} />} title="Numbers" testid="numbers-btn" />
        <div className="w-px h-6 bg-[#E2E8F0] mx-1" />
        <input type="color" onChange={(e) => exec("foreColor", e.target.value)} title="Text color" data-testid="color-picker" className="w-8 h-8 border border-[#E2E8F0] cursor-pointer" />
        <ToolButton onClick={insertLink} icon={<LinkSimple size={16} />} title="Link" testid="link-btn" />
        <ToolButton onClick={() => fileRef.current?.click()} icon={<ImageIcon size={16} />} title="Image (signature)" testid="image-btn" />
        <input ref={fileRef} type="file" accept="image/*" onChange={insertImage} className="hidden" data-testid="image-file-input" />
      </div>

      {/* Merge tags */}
      {headers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E2E8F0] bg-[#F8F9FA] px-3 py-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] mr-1">Merge tags:</span>
          {headers.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => insertMergeTag(h)}
              data-testid={`merge-tag-${h}`}
              className="font-mono text-xs border border-[#DBE3FF] bg-[#EEF2FF] text-[#002FA7] px-2 py-0.5 hover:bg-[#002FA7] hover:text-white transition-colors"
            >
              {`{${h}}`}
            </button>
          ))}
        </div>
      )}

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        onBlur={onInput}
        className="rich-editor"
        data-testid="rich-editor-content"
      />
    </div>
  );
}

function ToolButton({ onClick, icon, title, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-testid={testid}
      className="h-8 w-8 flex items-center justify-center border border-transparent hover:border-[#E2E8F0] hover:bg-white text-[#111827]"
    >
      {icon}
    </button>
  );
}
