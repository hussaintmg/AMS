import React from 'react';
import { EmailTemplatesProvider } from './EmailTemplatesContext';
import { EmailComponentsProvider } from './EmailComponentsContext';
import { EmailUsageProvider } from './EmailUsageContext';
import { EmailVariablesProvider } from './EmailVariablesContext';
import { EmailSMTPProvider } from './EmailSMTPContext';
import { EmailQueueProvider } from './EmailQueueContext';
import { EmailAssetsProvider } from './EmailAssetsContext';

export function EmailProvider({ children }) {
  return (
    <EmailTemplatesProvider>
      <EmailComponentsProvider>
        <EmailUsageProvider>
          <EmailVariablesProvider>
            <EmailSMTPProvider>
              <EmailQueueProvider>
                <EmailAssetsProvider>
                  {children}
                </EmailAssetsProvider>
              </EmailQueueProvider>
            </EmailSMTPProvider>
          </EmailVariablesProvider>
        </EmailUsageProvider>
      </EmailComponentsProvider>
    </EmailTemplatesProvider>
  );
}
