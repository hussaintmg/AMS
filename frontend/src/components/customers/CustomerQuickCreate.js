import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CustomersProvider } from '../../context/CustomersContext';
import { useAuth } from '../../context/AuthContext';
import { canUseQuickCreate, pageKeyForPath } from '../../utils/roleJobs';
import CustomerFormModal from './CustomerFormModal';

/**
 * Rule 2 — Dropdown Quick Create for Customer dropdowns.
 * Renders the standard "+ Customer" label link and opens the reusable
 * CustomerFormModal. The created customer is reported back through
 * `onCreated` so the caller can refresh its dropdown and auto-select
 * the new record without a page reload.
 *
 * Two grants decide: the Customers page's Create right (may this role make a
 * customer at all) and the shortcut itself on this page's form (Role Jobs →
 * Forms → "+ Customer"). `form` is 'create' (default) or 'edit'.
 */
export default function CustomerQuickCreate({ label = '+ Customer', onCreated, form = 'create', pageKey }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  // Raising a customer from a service or sales form is still creating a
  // customer, so the Customers page's Create right allows it — and so does
  // "+ Customer" ticked on this page's own form, for a role that may create
  // here. Either way the shortcut can be withheld per form in Role Jobs.
  const screen = pageKey || pageKeyForPath(user, pathname);
  if (!canUseQuickCreate(user, { host: screen, form, key: 'customer', owner: 'customers' })) return null;

  return (
    <>
      <button type="button" className="label-add-link" data-quick-create="customer" onClick={() => setOpen(true)}>{label}</button>
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
