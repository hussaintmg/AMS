import React from 'react';
import {
  Layout as LayoutIcon,
  Maximize2,
  Square,
  Type as TypeIcon,
  Zap,
} from 'lucide-react';
import EmailColorPicker from './EmailColorPicker';
import DraggablePopup, { DraggableHeader } from '../../components/EmailDraggablePopup';

const FONT_FAMILIES = [
  { name: 'Default', value: 'system-ui, sans-serif' },
  { name: 'Serif', value: "'Times New Roman', serif" },
  { name: 'Mono', value: "'Courier New', monospace" },
];

const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'];

export default function EmailCssPanel({
  isOpen,
  css,
  setCss,
  onApply,
  onWrap,
}) {
  const [activeTab, setActiveTab] = React.useState('layout');
  const [activePicker, setActivePicker] = React.useState(null);

  const update = (key, value) => setCss(prev => ({ ...prev, [key]: value }));

  const closePicker = () => setActivePicker(null);

  const handleCssInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onApply?.('block');
    }
  };

  return isOpen && (
    <div className="email-css-panel email-css-panel-open">
      <div className="email-css-tabs">
        <button type="button" className={`email-css-tab ${activeTab === 'layout' ? 'active' : ''}`} onClick={() => setActiveTab('layout')} title="Layout">
          <LayoutIcon size={14} />
        </button>
        <button type="button" className={`email-css-tab ${activeTab === 'spacing' ? 'active' : ''}`} onClick={() => setActiveTab('spacing')} title="Spacing">
          <Maximize2 size={14} />
        </button>
        <button type="button" className={`email-css-tab ${activeTab === 'surface' ? 'active' : ''}`} onClick={() => setActiveTab('surface')} title="Surface">
          <Square size={14} />
        </button>
        <button type="button" className={`email-css-tab ${activeTab === 'text' ? 'active' : ''}`} onClick={() => setActiveTab('text')} title="Text">
          <TypeIcon size={14} />
        </button>
        <button type="button" className="email-css-apply" onClick={() => onApply?.('block')} title="Apply to block">
          <Zap size={14} />
        </button>
      </div>

      <div className="email-css-content">
        {activeTab === 'layout' && (
          <div className="email-css-grid">
            <CssSelect label="Display" options={['block', 'inline', 'inline-block', 'flex', 'grid']} value={css.display} onChange={v => update('display', v)} />
            <CssSelect label="Direction" options={['row', 'column', 'row-reverse', 'column-reverse']} value={css.flexDir} onChange={v => update('flexDir', v)} />
            <CssSelect label="Align" options={['stretch', 'center', 'flex-start', 'flex-end']} value={css.align} onChange={v => update('align', v)} />
            <CssSelect label="Justify" options={['flex-start', 'center', 'flex-end', 'space-around', 'space-between']} value={css.justify} onChange={v => update('justify', v)} />
            <CssInput label="Gap" placeholder="px" value={css.gap} onChange={v => update('gap', v)} onKeyDown={handleCssInputKeyDown} />
            <CssInput label="Width" placeholder="100%" value={css.width} onChange={v => update('width', v)} onKeyDown={handleCssInputKeyDown} />
            <CssInput label="Height" placeholder="auto" value={css.height} onChange={v => update('height', v)} onKeyDown={handleCssInputKeyDown} />
          </div>
        )}

        {activeTab === 'spacing' && (
          <div className="email-css-grid">
            <div className="email-css-subgroup">
              <label className="email-css-subgroup-label">Padding</label>
              <div className="email-css-matrix">
                <CssInput label="T" placeholder="0" value={css.pt} onChange={v => update('pt', v)} onKeyDown={handleCssInputKeyDown} />
                <CssInput label="R" placeholder="0" value={css.pr} onChange={v => update('pr', v)} onKeyDown={handleCssInputKeyDown} />
                <CssInput label="B" placeholder="0" value={css.pb} onChange={v => update('pb', v)} onKeyDown={handleCssInputKeyDown} />
                <CssInput label="L" placeholder="0" value={css.pl} onChange={v => update('pl', v)} onKeyDown={handleCssInputKeyDown} />
              </div>
            </div>
            <div className="email-css-subgroup">
              <label className="email-css-subgroup-label">Margin</label>
              <div className="email-css-matrix">
                <CssInput label="T" placeholder="0" value={css.mt} onChange={v => update('mt', v)} onKeyDown={handleCssInputKeyDown} />
                <CssInput label="R" placeholder="0" value={css.mr} onChange={v => update('mr', v)} onKeyDown={handleCssInputKeyDown} />
                <CssInput label="B" placeholder="0" value={css.mb} onChange={v => update('mb', v)} onKeyDown={handleCssInputKeyDown} />
                <CssInput label="L" placeholder="0" value={css.ml} onChange={v => update('ml', v)} onKeyDown={handleCssInputKeyDown} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'surface' && (
          <div className="email-css-grid">
            <div className="email-css-subgroup" style={{ gridColumn: '1 / -1' }}>
              <label className="email-css-subgroup-label">Border Style</label>
              <CssSelect label="" options={BORDER_STYLES} value={css.bs} onChange={v => update('bs', v)} />
            </div>
            <div className="email-css-subgroup">
              <label className="email-css-subgroup-label">Border Width</label>
              <div className="email-css-matrix">
                <CssInput label="T" placeholder="1" value={css.btw} onChange={v => update('btw', v)} onKeyDown={handleCssInputKeyDown} />
                <CssInput label="R" placeholder="1" value={css.brw} onChange={v => update('brw', v)} onKeyDown={handleCssInputKeyDown} />
                <CssInput label="B" placeholder="1" value={css.bbw} onChange={v => update('bbw', v)} onKeyDown={handleCssInputKeyDown} />
                <CssInput label="L" placeholder="1" value={css.blw} onChange={v => update('blw', v)} onKeyDown={handleCssInputKeyDown} />
              </div>
            </div>
            <div className="email-css-subgroup">
              <label className="email-css-subgroup-label">Border Radius</label>
              <div className="email-css-matrix">
                <CssInput label="TL" placeholder="0" value={css.rtl} onChange={v => update('rtl', v)} onKeyDown={handleCssInputKeyDown} />
                <CssInput label="TR" placeholder="0" value={css.rtr} onChange={v => update('rtr', v)} onKeyDown={handleCssInputKeyDown} />
                <CssInput label="BR" placeholder="0" value={css.rbr} onChange={v => update('rbr', v)} onKeyDown={handleCssInputKeyDown} />
                <CssInput label="BL" placeholder="0" value={css.rbl} onChange={v => update('rbl', v)} onKeyDown={handleCssInputKeyDown} />
              </div>
            </div>
            <div className="email-css-subgroup">
              <label className="email-css-subgroup-label">Border Color</label>
              <div className="email-css-matrix">
                <CssColorBtn label="T" color={css.btc} onClick={() => setActivePicker('btc')} />
                <CssColorBtn label="R" color={css.brc} onClick={() => setActivePicker('brc')} />
                <CssColorBtn label="B" color={css.bbc} onClick={() => setActivePicker('bbc')} />
                <CssColorBtn label="L" color={css.blc} onClick={() => setActivePicker('blc')} />
              </div>
            </div>
            <div className="email-css-subgroup pos-relative">
              <label className="email-css-subgroup-label">Background</label>
              <CssColorBtn label="Bg" color={css.bg} onClick={() => setActivePicker('bg')} />
            </div>
            <div className="email-css-subgroup" style={{ gridColumn: '1 / -1' }}>
              <button type="button" className="btn btn-sm btn-secondary" style={{ width: '100%' }} onClick={() => onWrap?.()}>
                <Zap size={12} style={{ marginRight: 6 }} />Apply to Selected Text
              </button>
            </div>
          </div>
        )}

        {activeTab === 'text' && (
          <div className="email-css-grid">
            <CssSelect label="Font" options={FONT_FAMILIES.map(f => f.value)} value={css.ff} onChange={v => update('ff', v)} displayLabels={FONT_FAMILIES.map(f => f.name)} />
            <CssInput label="Size" placeholder="16" value={css.fs} onChange={v => update('fs', v)} onKeyDown={handleCssInputKeyDown} />
            <CssSelect label="Weight" options={['400', '500', '600', '700', '800', '900']} value={css.fw} onChange={v => update('fw', v)} />
            <div className="pos-relative">
              <label className="email-css-field-label">Color</label>
              <CssColorBtn label="" color={css.color} onClick={() => setActivePicker('textColor')} />
            </div>
          </div>
        )}
      </div>

      {activePicker && (
        <DraggablePopup isOpen={true} onClose={closePicker} style={{ maxWidth: 300 }}>
          <DraggableHeader onClose={closePicker}>
            <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Pick Color</h4>
          </DraggableHeader>
          <div style={{ padding: '8px 12px 12px' }}>
            <EmailColorPicker
              onSelect={c => { update(activePicker, c); closePicker(); }}
              onClose={closePicker}
            />
          </div>
        </DraggablePopup>
      )}
    </div>
  );
}

function CssSelect({ label, options, value, onChange, displayLabels }) {
  return (
    <div className="email-css-field">
      <label className="email-css-field-label">{label}</label>
      <select className="form-control" value={value} onChange={e => onChange(e.target.value)}>
        {options.map((o, i) => (
          <option key={o} value={o}>{displayLabels?.[i] || o}</option>
        ))}
      </select>
    </div>
  );
}

function CssInput({ label, placeholder, value, onChange, onKeyDown }) {
  return (
    <div className="email-css-field">
      <label className="email-css-field-label">{label}</label>
      <input className="form-control" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown} />
    </div>
  );
}

function CssColorBtn({ label, color, onClick }) {
  return (
    <div className="email-css-field">
      {label && <label className="email-css-field-label">{label}</label>}
      <button type="button" className="email-css-color-btn" onClick={onClick} style={{ background: color || '#fff' }}>
        {!color && <span style={{ color: '#999', fontSize: 9 }}>Pick</span>}
      </button>
    </div>
  );
}
