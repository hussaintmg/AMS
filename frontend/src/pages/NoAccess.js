import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import '../styles/noAccess.css';

/**
 * Why a page did not open.
 *
 * This used to be reached only by an account with no pages at all; being refused
 * one particular page redirected to whatever page happened to be first in the
 * role's list, silently. That is how a missing grant came to be reported as a
 * broken link — the operator clicks Leads, lands on Parts, and nothing anywhere
 * says a permission is involved.
 *
 * So it now answers two different situations: no pages at all, and this page in
 * particular. In the second it names the page and offers the ones the role does
 * hold, because "ask an administrator" is only useful if you can say what for.
 */
function NoAccess() {
  const { logout, effectivePermissions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const deniedPath = location.state?.deniedPath;

  const allowed = (effectivePermissions || [])
    .filter((permission) => permission.canView === true && permission.isActive !== false && permission.path)
    .map((permission) => ({ label: permission.pageKey || permission.path, path: permission.path }));

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="no-access">
      <ShieldOff size={44} className="no-access-icon" aria-hidden="true" />
      <h1>No access</h1>

      {deniedPath ? (
        <>
          <p className="no-access-lead">
            Your role cannot open <code>{deniedPath}</code>.
          </p>
          <p className="no-access-hint">
            An administrator can grant it in Server Management → Role Jobs: pick your
            role, find the page and turn on “Allow this page”.
          </p>
        </>
      ) : (
        <>
          <p className="no-access-lead">Your role has not been given any page yet.</p>
          <p className="no-access-hint">
            An administrator can grant pages in Server Management → Role Jobs.
          </p>
        </>
      )}

      {allowed.length > 0 && (
        <div className="no-access-allowed">
          <span>Pages you can open:</span>
          <div className="no-access-links">
            {allowed.map((page) => (
              <button
                key={page.path}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(page.path)}
              >
                {page.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="btn btn-primary no-access-logout" onClick={handleLogout}>
        Log out
      </button>
    </div>
  );
}

export default NoAccess;
