import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Pencil, Trash2, Save, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { pdfManagementAPI } from '../services/api';
import '../styles/pdfManagement.css';

const TYPES = [{ key: 'quotation', label: 'Quotation' }, { key: 'booking', label: 'Booking' }, { key: 'order', label: 'Sales Order' }, { key: 'invoice', label: 'Invoice' }];

export default function PdfManagement() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('usage');
  const [templates, setTemplates] = useState([]);
  const [usages, setUsages] = useState([]);
  const [variables, setVariables] = useState([]);
  const [variableType, setVariableType] = useState('quotation');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', documentType: 'quotation', description: '' });
  const [variableForm, setVariableForm] = useState({ key: '', label: '', category: 'custom' });
  const [variableFile, setVariableFile] = useState(null);
  const load = async () => {
    const [templateRes, usageRes] = await Promise.all([pdfManagementAPI.getTemplates(), pdfManagementAPI.getUsages()]);
    setTemplates(templateRes.data?.data?.templates || []); setUsages(usageRes.data?.data?.usages || []);
  };
  useEffect(() => { load().catch(() => toast.error('Failed to load PDF management')); }, []);
  useEffect(() => { if (tab === 'variables') pdfManagementAPI.getVariables(variableType).then((r) => setVariables(r.data?.data?.variables || [])); }, [tab, variableType]);
  const activeByType = useMemo(() => Object.fromEntries(TYPES.map((type) => [type.key, templates.filter((item) => item.documentType === type.key && item.status === 'active')])), [templates]);
  const create = async (e) => { e.preventDefault(); const res = await pdfManagementAPI.createTemplate(form); const item = res.data?.data?.template; setCreating(false); await load(); navigate(`/pdf-management/templates/${item.id}/editor`); };
  const assign = async (type, templateId) => { await pdfManagementAPI.assignUsage(type, templateId); toast.success('Usage saved'); load(); };
  const remove = async (id) => { if (!window.confirm('Delete this PDF template?')) return; await pdfManagementAPI.deleteTemplate(id); toast.success('Template deleted'); load(); };
  const addVariable = async (e) => { e.preventDefault(); await pdfManagementAPI.createVariable({ ...variableForm, documentType: variableType }); setVariableForm({ key:'',label:'',category:'custom' }); const r=await pdfManagementAPI.getVariables(variableType); setVariables(r.data?.data?.variables||[]); toast.success('Variable added'); };
  const importVariables = async () => { if (!variableFile) return; const text = await variableFile.text(); let rows=[]; try { if (variableFile.name.toLowerCase().endsWith('.json')) rows=JSON.parse(text); else if (variableFile.name.toLowerCase().endsWith('.xml')) { rows=[...text.matchAll(/<variable[^>]*key=["']([^"']+)["'][^>]*>/gi)].map(m=>({key:m[1]})); } else { const lines=text.split(/\r?\n/).filter(Boolean), headers=lines.shift().split(',').map(v=>v.trim()); rows=lines.map(line=>Object.fromEntries(line.split(',').map((v,i)=>[headers[i],v.trim()]))); } if(!Array.isArray(rows)) throw new Error(); await pdfManagementAPI.bulkVariables({documentType:variableType,variables:rows}); const r=await pdfManagementAPI.getVariables(variableType); setVariables(r.data?.data?.variables||[]); setVariableFile(null); toast.success('Variables imported'); } catch { toast.error('Use valid JSON, CSV or XML'); } };
  return <div className="pdf-management-page">
    <header className="pdf-page-header"><div><h1>PDF Management</h1><p>Design and assign server-generated sales documents.</p></div>{tab === 'templates' && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={17}/> New Template</button>}</header>
    <div className="pdf-tabs">{['usage','templates','variables'].map((key) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{key[0].toUpperCase()+key.slice(1)}</button>)}</div>
    {tab === 'usage' && <section className="pdf-panel"><div className="pdf-section-title"><h2>Document Usage</h2><p>Only active templates can be assigned.</p></div><div className="pdf-usage-list">{TYPES.map((type) => { const usage = usages.find((u) => u.documentType === type.key); return <div className="pdf-usage-row" key={type.key}><div className="pdf-usage-name"><FileText size={20}/><div><strong>{type.label}</strong><span>Sales / {type.label}</span></div></div><select value={usage?.template?._id || ''} onChange={(e) => assign(type.key, e.target.value)}><option value="">Select active template</option>{activeByType[type.key].map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>; })}</div></section>}
    {tab === 'templates' && <section className="pdf-panel"><div className="pdf-template-grid">{templates.map((item) => <article className="pdf-template-card" key={item.id}><div><span className={`pdf-status ${item.status}`}>{item.status}</span><h3>{item.name}</h3><p>{TYPES.find((t) => t.key === item.documentType)?.label}</p></div><div className="pdf-card-actions"><button title="Edit" onClick={() => navigate(`/pdf-management/templates/${item.id}/editor`)}><Pencil size={17}/></button><button title="Delete" onClick={() => remove(item.id)}><Trash2 size={17}/></button></div></article>)}</div></section>}
    {tab === 'variables' && <section className="pdf-panel"><div className="pdf-section-title row"><div><h2>Variables</h2><p>Use these references inside text elements.</p></div><select value={variableType} onChange={(e) => setVariableType(e.target.value)}>{TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div><form className="pdf-variable-create" onSubmit={addVariable}><input required placeholder="Variable key e.g. company.name" value={variableForm.key} onChange={e=>setVariableForm({...variableForm,key:e.target.value})}/><input placeholder="Label" value={variableForm.label} onChange={e=>setVariableForm({...variableForm,label:e.target.value})}/><button className="btn btn-primary"><Plus size={15}/> Add</button><label className="btn btn-secondary"><Upload size={15}/> Import JSON/CSV/XML<input hidden type="file" accept=".json,.csv,.xml" onChange={e=>setVariableFile(e.target.files[0])}/></label>{variableFile&&<button type="button" className="btn btn-secondary" onClick={importVariables}>Import {variableFile.name}</button>}</form><div className="pdf-variable-list">{variables.map((v) => <button key={v.key} onClick={() => navigator.clipboard.writeText(v.reference)}><code>{v.reference}</code><span>{v.label || v.category}</span></button>)}</div></section>}
    {creating && <div className="modal-overlay" onClick={() => setCreating(false)}><form className="modal-content pdf-create-modal" onSubmit={create} onClick={(e) => e.stopPropagation()}><div className="modal-header"><h3>Create PDF Template</h3><button type="button" className="modal-close" onClick={() => setCreating(false)}>×</button></div><div className="modal-body"><label>Name</label><input autoFocus required value={form.name} onChange={(e) => setForm({...form,name:e.target.value})}/><label>Document Type</label><select value={form.documentType} onChange={(e) => setForm({...form,documentType:e.target.value})}>{TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select><label>Description</label><textarea value={form.description} onChange={(e) => setForm({...form,description:e.target.value})}/></div><div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>Cancel</button><button className="btn btn-primary"><Save size={16}/> Create & Edit</button></div></form></div>}
  </div>;
}
