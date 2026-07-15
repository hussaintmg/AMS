import React, { useState } from 'react';
import { CustomersProvider } from '../../context/CustomersContext';
import CustomerFormModal from './CustomerFormModal';

/**
 * Rule 2 — Dropdown Quick Create for Customer dropdowns.
 * Renders the standard "+ Customer" label link and opens the reusable
 * CustomerFormModal. The created customer is reported back through
 * `onCreated` so the caller can refresh its dropdown and auto-select
 * the new record without a page reload.
 */
export default function CustomerQuickCreate({ label = '+ Customer', onCreated }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="label-add-link" onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <CustomersProvider>
          <CustomerFormModal
            onClose={() => setOpen(false)}
            onSaved={(created) => { if (onCreated) onCreated(created); }}
          />
        </CustomersProvider>
      )}
    </>
  );
}
