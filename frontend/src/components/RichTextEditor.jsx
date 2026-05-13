import { useRef, useState, useEffect, useCallback } from "react";
import {
  TextB, TextItalic, TextUnderline, TextAlignLeft, TextAlignCenter,
  TextAlignRight, TextAlignJustify, ListBullets, ListNumbers, Image as ImageIcon,
  LinkSimple, TextHOne, TextHTwo, X,
} from "@phosphor-icons/react";

const FONT_SIZES = [
  { v: "1", label: "10px" }, { v: "2", label: "13px" }, { v: "3", label: "16px" },
  { v: "4", label: "18px" }, { v: "5", label: "24px" }, { v: "6", label: "32px" }, { v: "7", label: "48px" },
];

const FONT_FAMILIES = [
  "Inter", "Arial", "Helvetica", "Georgia", "Times New Roman", "Courier New", "Verdana", "Tahoma",
];

const WIDTH_PRESETS = [
  { label: "25%", value: "25%" },
  { label: "50%", value: "50%" },
  { label: "75%", value: "75%" },
  { label: "100%", value: "100%" },
  { label: "Auto", value: "auto" },
];

export default function RichTextEditor({ value, onChange, headers = [] }) {
  const ref = useRef(null);
  const fileRef = useRef(null);
  const [selectedImg, setSelectedImg] = useState(null); // HTMLImageElement
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const [pxInput, setPxInput] = useState("");

  // Initialize content once
  const initialized = useRef(false);
  if (ref.current && !initialized.current) {
    ref.current.innerHTML = value || "";
    initialized.current = true;
  }

  const emit = () => onChange(ref.current?.innerHTML || "");

  const exec = (cmd, arg = null) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };

  const onInput = () => emit();

  const insertImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // Insert with default max-width:100% and a class for selection
      const html = `<img src="${reader.result}" style="max-width:100%;height:auto" class="re-img" alt="" />`;
      exec("insertHTML", html);
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

  const positionPopover = useCallback((img) => {
    if (!img || !ref.current) return;
    const editorRect = ref.current.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    setPopoverPos({
      top: imgRect.top - editorRect.top + ref.current.scrollTop - 44,
      left: imgRect.left - editorRect.left + ref.current.scrollLeft,
    });
  }, []);

  // Click handler on editor: select / deselect image
  const onEditorClick = (e) => {
    const tag = e.target.tagName;
    if (tag === "IMG") {
      // clear other selections
      ref.current.querySelectorAll("img.re-selected").forEach((i) => i.classList.remove("re-selected"));
      e.target.classList.add("re-selected");
      setSelectedImg(e.target);
      setPxInput(String(e.target.getBoundingClientRect().width.toFixed(0)));
      positionPopover(e.target);
    } else {
      if (selectedImg) {
        selectedImg.classList.remove("re-selected");
      }
      setSelectedImg(null);
    }
  };

  // Reposition popover on scroll / resize
  useEffect(() => {
    if (!selectedImg) return;
    const update = () => positionPopover(selectedImg);
    update();
    window.addEventListener("resize", update);
    ref.current?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      ref.current?.removeEventListener("scroll", update);
    };
  }, [selectedImg, positionPopover]);

  // Keyboard delete on selected image
  useEffect(() => {
    const onKey = (e) => {
      if (!selectedImg) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        // Only if the editor or popover is focused (avoid stealing from inputs)
        const active = document.activeElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
        e.preventDefault();
        selectedImg.remove();
        setSelectedImg(null);
        emit();
      } else if (e.key === "Escape") {
        selectedImg.classList.remove("re-selected");
        setSelectedImg(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedImg]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyWidth = (w) => {
    if (!selectedImg) return;
    if (w === "auto") {
      selectedImg.style.width = "";
      selectedImg.style.height = "";
      selectedImg.removeAttribute("width");
      selectedImg.removeAttribute("height");
    } else {
      selectedImg.style.width = w;
      selectedImg.style.height = "auto";
      // Remove deprecated html attrs to avoid conflict
      selectedImg.removeAttribute("width");
      selectedImg.removeAttribute("height");
    }
    emit();
    positionPopover(selectedImg);
    setPxInput(String(selectedImg.getBoundingClientRect().width.toFixed(0)));
  };

  const applyPx = () => {
    if (!selectedImg) return;
    const n = parseInt(pxInput, 10);
    if (Number.isNaN(n) || n < 10) return;
    selectedImg.style.width = `${n}px`;
    selectedImg.style.height = "auto";
    selectedImg.removeAttribute("width");
    selectedImg.removeAttribute("height");
    emit();
    positionPopover(selectedImg);
  };

  const alignImage = (cmd) => {
    if (!selectedImg) return;
    selectedImg.style.display = "block";
    if (cmd === "left") { selectedImg.style.marginLeft = "0"; selectedImg.style.marginRight = "auto"; }
    if (cmd === "center") { selectedImg.style.marginLeft = "auto"; selectedImg.style.marginRight = "auto"; }
    if (cmd === "right") { selectedImg.style.marginLeft = "auto"; selectedImg.style.marginRight = "0"; }
    emit();
    positionPopover(selectedImg);
  };

  // Drag handle resize
  const onResizeHandleMouseDown = (e) => {
    if (!selectedImg) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = selectedImg.getBoundingClientRect().width;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const newW = Math.max(20, Math.round(startWidth + dx));
      selectedImg.style.width = `${newW}px`;
      selectedImg.style.height = "auto";
      selectedImg.removeAttribute("width");
      selectedImg.removeAttribute("height");
      setPxInput(String(newW));
      positionPopover(selectedImg);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      emit();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const removeImage = () => {
    if (!selectedImg) return;
    selectedImg.remove();
    setSelectedImg(null);
    emit();
  };

  // Compute resize handle position (bottom-right of selected image, relative to editor)
  const handleStyle = (() => {
    if (!selectedImg || !ref.current) return { display: "none" };
    const editorRect = ref.current.getBoundingClientRect();
    const imgRect = selectedImg.getBoundingClientRect();
    return {
      top: imgRect.bottom - editorRect.top + ref.current.scrollTop - 7,
      left: imgRect.right - editorRect.left + ref.current.scrollLeft - 7,
    };
  })();

  return (
    <div className="border border-[#E2E8F0] bg-white" data-testid="rich-text-editor">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-[#E2E8F0] bg-[#F8F9FA] p-2">
        <select onChange={(e) => exec("fontName", e.target.value)} defaultValue="" data-testid="font-family-select" className="text-xs border border-[#E2E8F0] bg-white px-2 py-1 h-8">
          <option value="" disabled>Font</option>
          {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select onChange={(e) => exec("fontSize", e.target.value)} defaultValue="" data-testid="font-size-select" className="text-xs border border-[#E2E8F0] bg-white px-2 py-1 h-8">
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
            <button key={h} type="button" onClick={() => insertMergeTag(h)} data-testid={`merge-tag-${h}`} className="font-mono text-xs border border-[#DBE3FF] bg-[#EEF2FF] text-[#002FA7] px-2 py-0.5 hover:bg-[#002FA7] hover:text-white transition-colors">
              {`{${h}}`}
            </button>
          ))}
        </div>
      )}

      {/* Editor + overlays */}
      <div className="relative">
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={onInput}
          onBlur={onInput}
          onClick={onEditorClick}
          className="rich-editor"
          data-testid="rich-editor-content"
        />

        {/* Image resize popover */}
        {selectedImg && (
          <div
            className="absolute z-20 flex items-center gap-1 bg-[#111827] text-white px-2 py-1 shadow-md"
            style={{ top: popoverPos.top, left: popoverPos.left }}
            onMouseDown={(e) => e.preventDefault()} // keep focus on image, don't lose selection
            data-testid="image-resize-popover"
          >
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/60 pr-1">Width</span>
            {WIDTH_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => applyWidth(p.value)}
                data-testid={`img-width-${p.value}`}
                className="text-[11px] font-mono px-1.5 py-0.5 border border-white/20 hover:bg-white hover:text-[#111827] transition-colors"
              >
                {p.label}
              </button>
            ))}
            <span className="w-px h-5 bg-white/20 mx-1" />
            <input
              type="number"
              min="10"
              value={pxInput}
              onChange={(e) => setPxInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyPx(); } }}
              data-testid="img-px-input"
              className="w-14 text-[11px] font-mono px-1 py-0.5 bg-[#0a0a0a] border border-white/20 text-white"
            />
            <button type="button" onClick={applyPx} data-testid="img-px-apply" className="text-[11px] font-mono px-1.5 py-0.5 border border-white/20 hover:bg-white hover:text-[#111827]">px</button>
            <span className="w-px h-5 bg-white/20 mx-1" />
            <button type="button" onClick={() => alignImage("left")} title="Align left" className="text-[11px] px-1.5 py-0.5 border border-white/20 hover:bg-white hover:text-[#111827]" data-testid="img-align-left">L</button>
            <button type="button" onClick={() => alignImage("center")} title="Center" className="text-[11px] px-1.5 py-0.5 border border-white/20 hover:bg-white hover:text-[#111827]" data-testid="img-align-center">C</button>
            <button type="button" onClick={() => alignImage("right")} title="Align right" className="text-[11px] px-1.5 py-0.5 border border-white/20 hover:bg-white hover:text-[#111827]" data-testid="img-align-right">R</button>
            <span className="w-px h-5 bg-white/20 mx-1" />
            <button type="button" onClick={removeImage} title="Delete image" className="text-red-300 hover:bg-red-500 hover:text-white p-1" data-testid="img-delete-btn">
              <X size={12} weight="bold" />
            </button>
          </div>
        )}

        {/* Drag-resize handle (bottom-right of selected image) */}
        {selectedImg && (
          <div
            onMouseDown={onResizeHandleMouseDown}
            className="absolute z-20 w-3.5 h-3.5 bg-[#002FA7] border-2 border-white cursor-nwse-resize"
            style={{ top: handleStyle.top, left: handleStyle.left }}
            title="Drag to resize"
            data-testid="img-drag-handle"
          />
        )}
      </div>
    </div>
  );
}

function ToolButton({ onClick, icon, title, testid }) {
  return (
    <button type="button" onClick={onClick} title={title} data-testid={testid} className="h-8 w-8 flex items-center justify-center border border-transparent hover:border-[#E2E8F0] hover:bg-white text-[#111827]">
      {icon}
    </button>
  );
}
