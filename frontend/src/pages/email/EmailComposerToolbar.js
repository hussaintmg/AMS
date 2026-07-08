import React, { useState } from 'react';
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered,
  Link2, Image, Type, Palette,
  Undo2, Redo2,
  Settings2, Code, Variable,
  Puzzle,
  Minus,
} from 'lucide-react';

const fontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 42, 48];
const fontFamilies = [
  'Arial, sans-serif',
  'Helvetica, sans-serif',
  'Georgia, serif',
  'Times New Roman, serif',
  'Courier New, monospace',
  'Tahoma, sans-serif',
  'Verdana, sans-serif',
];

export default function EmailComposerToolbar({
  onAction,
  onUndo,
  onRedo,
  onOpenCssPanel,
  onOpenCodeEditor,
  onOpenLinkPanel,
  onOpenImagePanel,
  onOpenVarPicker,
  onOpenCompPicker,
  canUndo,
  canRedo,
  isCssPanelOpen,
  isCodeEditorOpen,
  setShowColorPicker,
  setColorType,
}) {
  const [showFontSize, setShowFontSize] = useState(false);
  const [showFontFamily, setShowFontFamily] = useState(false);

  return (
    <div className="email-composer-toolbar">
      <div className="toolbar-group">
        <ToolBtn icon={<Bold size={14} />} title="Bold" onClick={() => onAction?.('bold')} />
        <ToolBtn icon={<Italic size={14} />} title="Italic" onClick={() => onAction?.('italic')} />
        <ToolBtn icon={<Underline size={14} />} title="Underline" onClick={() => onAction?.('underline')} />
        <ToolBtn icon={<Strikethrough size={14} />} title="Strikethrough" onClick={() => onAction?.('strikethrough')} />
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <ToolBtn onClick={() => onAction?.('heading1')}><span style={{ fontSize: 11, fontWeight: 800 }}>H1</span></ToolBtn>
        <ToolBtn onClick={() => onAction?.('heading2')}><span style={{ fontSize: 10, fontWeight: 800 }}>H2</span></ToolBtn>
        <ToolBtn onClick={() => onAction?.('heading3')}><span style={{ fontSize: 9, fontWeight: 800 }}>H3</span></ToolBtn>
        <ToolBtn onClick={() => onAction?.('paragraph')}><span style={{ fontSize: 10 }}>P</span></ToolBtn>
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <ToolBtn icon={<AlignLeft size={14} />} title="Align Left" onClick={() => onAction?.('justifyLeft')} />
        <ToolBtn icon={<AlignCenter size={14} />} title="Align Center" onClick={() => onAction?.('justifyCenter')} />
        <ToolBtn icon={<AlignRight size={14} />} title="Align Right" onClick={() => onAction?.('justifyRight')} />
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <ToolBtn icon={<List size={14} />} title="Bullet List" onClick={() => onAction?.('insertUnorderedList')} />
        <ToolBtn icon={<ListOrdered size={14} />} title="Numbered List" onClick={() => onAction?.('insertOrderedList')} />
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <ToolBtn icon={<Link2 size={14} />} title="Insert Link" onClick={onOpenLinkPanel} />
        <ToolBtn icon={<Image size={14} />} title="Insert Image" onClick={onOpenImagePanel} />
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group pos-relative">
        <ToolBtn icon={<Type size={14} />} title="Font Size" onClick={() => { setShowFontFamily(false); setShowFontSize(!showFontSize); }} />
        {showFontSize && (
          <div className="toolbar-dropdown-menu" onMouseLeave={() => setShowFontSize(false)}>
            {fontSizes.map(s => (
              <div key={s} className="toolbar-dropdown-item" onMouseDown={e => { e.preventDefault(); onAction?.('fontSize', s + 'px'); setShowFontSize(false); }}>
                {s}px
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="toolbar-group pos-relative">
        <ToolBtn onClick={() => { setShowFontSize(false); setShowFontFamily(!showFontFamily); }}>
          <span style={{ fontSize: 9, fontWeight: 600 }}>Font</span>
        </ToolBtn>
        {showFontFamily && (
          <div className="toolbar-dropdown-menu" onMouseLeave={() => setShowFontFamily(false)}>
            {fontFamilies.map(f => (
              <div key={f} className="toolbar-dropdown-item" style={{ fontFamily: f }} onMouseDown={e => { e.preventDefault(); onAction?.('fontFamily', f); setShowFontFamily(false); }}>
                {f.split(',')[0]}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <ToolBtn
          icon={<Palette size={14} />}
          title="Text Color"
          onClick={() => { setColorType?.('foreColor'); setShowColorPicker?.(true); }}
          style={{ color: '#dc2626' }}
        />
      </div>

      <div className="toolbar-group">
        <ToolBtn
          style={{ background: '#f0fdf4', fontSize: 9 }}
          title="Background Color"
          onClick={() => { setColorType?.('backColor'); setShowColorPicker?.(true); }}
        >
          <span style={{ fontWeight: 600 }}>Bg</span>
        </ToolBtn>
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        {onOpenVarPicker && <ToolBtn icon={<Variable size={14} />} title="Insert Variable" onClick={onOpenVarPicker} />}
        {onOpenCompPicker && <ToolBtn icon={<Puzzle size={14} />} title="Insert Component" onClick={onOpenCompPicker} />}
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <ToolBtn icon={<Settings2 size={14} />} title="CSS Panel" active={isCssPanelOpen} onClick={onOpenCssPanel} />
        <ToolBtn icon={<Code size={14} />} title="Code Editor" active={isCodeEditorOpen} onClick={onOpenCodeEditor} />
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <ToolBtn icon={<Undo2 size={14} />} title="Undo" onClick={onUndo} disabled={!canUndo} />
        <ToolBtn icon={<Redo2 size={14} />} title="Redo" onClick={onRedo} disabled={!canRedo} />
      </div>
    </div>
  );
}

function ToolBtn({ onClick, icon, children, title, active, disabled, style }) {
  return (
    <button
      className={`toolbar-btn${active ? ' active' : ''}`}
      onMouseDown={e => { e.preventDefault(); onClick?.(); }}
      title={title}
      disabled={disabled}
      style={style}
    >
      {icon || children}
    </button>
  );
}
