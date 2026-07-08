import React from 'react';
import { Routes, Route, NavLink, Navigate, useLocation, useParams } from 'react-router-dom';
import { EmailProvider } from '../context/EmailContext';
import EmailTemplatesPage from './email/EmailTemplatesPage';
import EmailBuilder from './email/EmailBuilder';
import EmailComponents from './email/EmailComponents';
import EmailComponentEditor from './email/EmailComponentEditor';
import EmailVariables from './email/EmailVariables';
import EmailUsage from './email/EmailUsage';
import EmailSMTP from './email/EmailSMTP';
import EmailQueue from './email/EmailQueue';
import '../styles/emailTemplates.css';

const tabs = [
  { key: 'templates', label: 'Templates', path: '/email/templates' },
  { key: 'components', label: 'Components', path: '/email/components' },
  { key: 'variables', label: 'Variables', path: '/email/variables' },
  { key: 'usage', label: 'Usage', path: '/email/usage' },
  { key: 'config', label: 'SMTP', path: '/email/config' },
  { key: 'queue', label: 'Queue', path: '/email/queue' },
];

function EmailTabs() {
  const location = useLocation();
  const isEditor = location.pathname.includes('/editor');
  const isPreview = location.pathname.includes('/preview');
  if (isEditor || isPreview) return null;
  return (
    <div className="email-tabs">
      {tabs.map(tab => (
        <NavLink
          key={tab.key}
          to={tab.path}
          className={({ isActive }) => `email-tab ${isActive ? 'active' : ''}`}
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}

function EmailContent() {
  return (
    <div>
      <EmailTabs />
      <Routes>
        <Route index element={<Navigate to="templates" replace />} />
        <Route path="templates" element={<EmailTemplatesPage />} />
        <Route path="templates/:id/editor" element={<EmailBuilderWrapper />} />
        <Route path="templates/:id/preview" element={<EmailTemplatesPage />} />
        <Route path="components" element={<EmailComponents />} />
        <Route path="components/:id/editor" element={<EmailComponentEditor />} />
        <Route path="variables" element={<EmailVariables />} />
        <Route path="usage" element={<EmailUsage />} />
        <Route path="config" element={<EmailSMTP />} />
        <Route path="queue" element={<EmailQueue />} />
        <Route path="*" element={<Navigate to="templates" replace />} />
      </Routes>
    </div>
  );
}

function EmailBuilderWrapper() {
  const { id } = useParams();
  return <EmailBuilder templateId={id} />;
}

export default function EmailTemplates() {
  return (
    <EmailProvider>
      <EmailContent />
    </EmailProvider>
  );
}
