import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Pencil, Trash2, Save, Upload, Search, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { pdfManagementAPI } from '../services/api';
import '../styles/pdfManagement.css';

const TYPES = [{ key: 'quotation', label: 'Quotation' }, { key: 'booking', label: 'Booking' }, { key: 'order', label: 'Sales Order' }, { key: 'invoice', label: 'Invoice' }];
const CATEGORY_LABELS = { document: 'Document', customer: 'Customer', vehicle: 'Vehicle', generator: 'Prepared by', company: 'Company', item: 'Items', custom: 'Custom' };

export default function PdfManagement() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('usage');
  const [templates, setTemplates] = useState([]);
  const [usages, setUsages] = useState([]);
  const [variables, setVariables] = useState([]);
  const [variableSamples, setVariableSamples] = useState({});
  const [sampleSource, setSampleSource] = useState(null);
  const [variableType, setVariableType] = useState('quotation');
  const [variableSearch, setVariableSearch] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', documentType: 'quotation', description: '' });
  const [variableForm, setVariableForm] = useState({ key: '', label: '', category: 'custom' });
  const [variableFile, setVariableFile] = useState(null);
  const load = async () => {
    const [templateRes, usageRes] = await Promise.all([pdfManagementAPI.getTemplates(), pdfManagementAPI.getUsages()]);
    setTemplates(templateRes.data?.data?.templates || []); setUsages(usageRes.data?.data?.usages || []);
  };
  const loadVariables = async () => {
    const [varRes, previewRes] = await Promise.all([
      pdfManagementAPI.getVariables(variableType),
      pdfManagementAPI.getVariablePreview(variableType).catch(() => ({ data: { data: {} } })),
    ]);
    setVariables(varRes.data?.data?.variables || []);
    setVariableSamples(previewRes.data?.data?.samples || {});
    setSampleSource(previewRes.data?.data?.sourceNumber || null);
  };
  useEffect(() => { load().catch(() => toast.error('Failed to load PDF management')); }, []);
  useEffect(() => { if (tab === 'variables') loadVariables().catch(() => toast.error('Failed to load variables')); /* eslint-disable-next-line */ }, [tab, variableType]);
  const activeByType = useMemo(() => Object.fromEntries(TYPES.map((type) => [type.key, templates.filter((item) => item.documentType === type.key && item.status === 'active')])), [templates]);
  const filteredVariables = useMemo(() => variables.filter((v) => `${v.key} ${v.label || ''}`.toLowerCase().includes(variableSearch.toLowerCase())), [variables, variableSearch]);
  const groupedVariables = useMemo(() => {
    const groups = {};
    filteredVariables.forEach((v) => { const cat = v.builtIn ? (v.category || 'custom') : 'custom'; (groups[cat] = groups[cat] || []).push(v); });
    return groups;
  }, [filteredVariables]);
  const create = async (e) => { e.preventDefault(); const res = await pdfManagementAPI.createTemplate(form); const item = res.data?.data?.template; setCreating(false); await load(); navigate(`/pdf-management/templates/${item.id}/editor`); };
  const assign = async (type, templateId) => { await pdfManagementAPI.assignUsage(type, templateId); toast.success('Usage saved'); load(); };
  const remove = async (id) => { if (!window.confirm('Delete this PDF template?')) return; await pdfManagementAPI.deleteTemplate(id); toast.success('Template deleted'); load(); };
  const copyVariable = (v) => { navigator.clipboard.writeText(v.reference); setCopiedKey(v.key); setTimeout(() => setCopiedKey(''), 1200); };
  const addVariable = async (e) => { e.preventDefault(); try { await pdfManagementAPI.createVariable({ ...variableForm, documentType: variableType }); setVariableForm({ key:'',label:'',category:'custom' }); await loadVariables(); toast.success('Variable added'); } catch (err) { toast.error(err.response?.data?.message || 'Failed to add variable'); } };
  const deleteVariable = async (v) => { if (!v.id) return; if (!window.confirm(`Remove custom variable ${v.reference}?`)) return; try { await pdfManagementAPI.deleteVariable(v.id); await loadVariables(); toast.success('Variable removed'); } catch { toast.error('Failed to remove variable'); } };
  const importVariables = async () => { if (!variableFile) return; const text = await variableFile.text(); let rows=[]; try { if (variableFile.name.toLowerCase().endsWith('.json')) rows=JSON.parse(text); else if (variableFile.name.toLowerCase().endsWith('.xml')) { rows=[...text.matchAll(/<variable[^>]*key=["']([^"']+)["'][^>]*>/gi)].map(m=>({key:m[1]})); } else { const lines=text.split(/\r?\n/).filter(Boolean), headers=lines.shift().split(',').map(v=>v.trim()); rows=lines.map(line=>Object.fromEntries(line.split(',').map((v,i)=>[headers[i],v.trim()]))); } if(!Array.isArray(rows)) throw new Error(); await pdfManagementAPI.bulkVariables({documentType:variableType,variables:rows}); await loadVariables(); setVariableFile(null); toast.success('Variables imported'); } catch { toast.error('Use valid JSON, CSV or XML'); } };
  return <div className="pdf-management-page">
    <header className="pdf-page-header"><div><h1>PDF Management</h1><p>Design and assign server-generated sales documents.</p></div>{tab === 'templates' && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={17}/> New Template</button>}</header>
    <div className="pdf-tabs">{['usage','templates','variables'].map((key) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{key[0].toUpperCase()+key.slice(1)}</button>)}</div>
    {tab === 'usage' && <section className="pdf-panel"><div className="pdf-section-title"><h2>Document Usage</h2><p>Only active templates can be assigned.</p></div><div className="pdf-usage-list">{TYPES.map((type) => { const usage = usages.find((u) => u.documentType === type.key); return <div className="pdf-usage-row" key={type.key}><div className="pdf-usage-name"><FileText size={20}/><div><strong>{type.label}</strong><span>Sales / {type.label}</span></div></div><select value={usage?.template?._id || ''} onChange={(e) => assign(type.key, e.target.value)}><option value="">Select active template</option>{activeByType[type.key].map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>; })}</div></section>}
    {tab === 'templates' && <section className="pdf-panel"><div className="pdf-template-grid">{templates.map((item) => <article className="pdf-template-card" key={item.id}><div><span className={`pdf-status ${item.status}`}>{item.status}</span><h3>{item.name}</h3><p>{TYPES.find((t) => t.key === item.documentType)?.label}</p></div><div className="pdf-card-actions"><button title="Edit" onClick={() => navigate(`/pdf-management/templates/${item.id}/editor`)}><Pencil size={17}/></button><button title="Delete" onClick={() => remove(item.id)}><Trash2 size={17}/></button></div></article>)}</div></section>}
    {tab === 'variables' && <section className="pdf-panel">
      <div className="pdf-section-title row"><div><h2>Variables</h2><p>Click any variable to copy its reference. Sample values come from your latest {TYPES.find(t=>t.key===variableType)?.label.toLowerCase()}{sampleSource ? ` (${sampleSource})` : ''}.</p></div><select value={variableType} onChange={(e) => setVariableType(e.target.value)}>{TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
      <form className="pdf-variable-create" onSubmit={addVariable}><input required placeholder="Custom key e.g. company.website" value={variableForm.key} onChange={e=>setVariableForm({...variableForm,key:e.target.value})}/><input placeholder="Label" value={variableForm.label} onChange={e=>setVariableForm({...variableForm,label:e.target.value})}/><button className="btn btn-primary"><Plus size={15}/> Add</button><label className="btn btn-secondary"><Upload size={15}/> Import JSON/CSV/XML<input hidden type="file" accept=".json,.csv,.xml" onChange={e=>setVariableFile(e.target.files[0])}/></label>{variableFile&&<button type="button" className="btn btn-secondary" onClick={importVariables}>Import {variableFile.name}</button>}</form>
      <div className="pdf-variable-searchbar"><Search size={15}/><input placeholder="Search variables..." value={variableSearch} onChange={e=>setVariableSearch(e.target.value)}/></div>
      {Object.keys(groupedVariables).length === 0 && <p className="pdf-variable-empty">No variables match your search.</p>}
      {Object.entries(groupedVariables).map(([cat, items]) => <div className="pdf-variable-group" key={cat}>
        <h4 className="pdf-variable-group-title">{CATEGORY_LABELS[cat] || cat}<span>{items.length}</span></h4>
        <div className="pdf-variable-cards">{items.map((v) => {
          const sample = variableSamples[v.key];
          return <div className={`pdf-variable-card${!v.builtIn ? ' custom' : ''}`} key={v.key} onClick={() => copyVariable(v)} title="Click to copy">
            <div className="pdf-variable-card-head"><code>{v.reference}</code>{copiedKey === v.key ? <Check size={14} className="pdf-copied"/> : <Copy size={13} className="pdf-copy-icon"/>}</div>
            <div className="pdf-variable-card-label">{v.label || v.key}</div>
            <div className={`pdf-variable-card-sample${sample ? '' : ' blank'}`}>{sample ? `→ ${sample}` : '→ (blank in latest record)'}</div>
            {!v.builtIn && <button type="button" className="pdf-variable-card-delete" onClick={(e)=>{e.stopPropagation();deleteVariable(v);}} title="Remove custom variable"><Trash2 size={13}/></button>}
          </div>;
        })}</div>
      </div>)}
    </section>}
    {creating && <div className="modal-overlay" onClick={() => setCreating(false)}><form className="modal-content pdf-create-modal" onSubmit={create} onClick={(e) => e.stopPropagation()}><div className="modal-header"><h3>Create PDF Template</h3><button type="button" className="modal-close" onClick={() => setCreating(false)}>×</button></div><div className="modal-body"><label>Name</label><input autoFocus required value={form.name} onChange={(e) => setForm({...form,name:e.target.value})}/><label>Document Type</label><select value={form.documentType} onChange={(e) => setForm({...form,documentType:e.target.value})}>{TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select><label>Description</label><textarea value={form.description} onChange={(e) => setForm({...form,description:e.target.value})}/></div><div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>Cancel</button><button className="btn btn-primary"><Save size={16}/> Create & Edit</button></div></form></div>}
  </div>;
}
