import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

function NoAccess() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <h1>No Access</h1>
      <p style={{ margin: '1rem 0', color: '#666', fontSize: '1.1rem' }}>
        You do not have access to any page.
      </p>
      <p style={{ marginBottom: '2rem', color: '#666' }}>
        Please contact your administrator.
      </p>
      <button className="btn btn-primary" onClick={handleLogout}>
        Logout
      </button>
    </div>
  );
}

export default NoAccess;