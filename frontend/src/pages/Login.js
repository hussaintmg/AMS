/**
 * Login Page
 * Maintained by Hussain Developer
 * AMS ERP
 */

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import Splash from '../components/Splash';
import logo from '../assets/logo.png';
import { showApiError } from '../utils/toastResponse';

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showSplash, setShowSplash] = useState(true);
    const { login } = useAuth();
    const { branding } = useBranding();
    const navigate = useNavigate();
    const location = useLocation();

    // Show splash screen on first load
    useEffect(() => {
        const timer = setTimeout(() => {
            setShowSplash(false);
        }, 3000); // Show splash for 3 seconds
        return () => clearTimeout(timer);
    }, []);

    // Get redirect location or default to dashboard
    const from = location.state?.from?.pathname || '/';

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email || !password) {
            toast.error('Please fill in all fields');
            return;
        }

        setLoading(true);
        try {
            const result = await login(email, password);
            if (result.success) {
                toast.success('Welcome back!');
                navigate(from, { replace: true });
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            showApiError(error, 'An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    if (showSplash) {
        return <Splash />;
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo">
                    <img src={branding?.loginLogo?.publicUrl || branding?.loginLogo?.url || logo} alt={branding?.applicationName || 'OMODA | JAECOO'} style={{ width: '180px', height: 'auto', marginBottom: '1rem' }} />
                    <h1>{branding?.applicationName || 'OMODA | JAECOO'}</h1>
                    <p>Auto Management System</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <input
                            type="email"
                            className="form-input"
                            placeholder="admin@ams.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            type="password"
                            className="form-input"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>

                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                    <Link to="/forgot-password">Forgot Password?</Link>
                </div>

            </div>
        </div>
    );
}

export default Login;
