import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authAPI } from '../services/api';
import logo from '../assets/logo.png';

const isSuccess = (res) => res?.status >= 200 && res?.status < 300 && res?.data?.success === true;

function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');
    const [valid, setValid] = useState(false);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({ password: '', confirmPassword: '' });

    useEffect(() => {
        const validateToken = async () => {
            if (!token) {
                navigate('/login', { replace: true });
                return;
            }
            try {
                await authAPI.checkResetToken({ token });
                setValid(true);
            } catch {
                toast.error('Reset token expired');
                navigate('/login', { replace: true });
            }
        };
        validateToken();
    }, [token, navigate]);

    const submit = async (event) => {
        event.preventDefault();
        setLoading(true);
        try {
            const res = await authAPI.resetPassword({ token, ...form });
            if (!isSuccess(res)) throw new Error(res.data?.message || 'Unable to reset password');
            toast.success(res.data?.message || 'Password reset successfully');
            navigate('/login', { replace: true });
        } catch (error) {
            toast.error(error.response?.data?.message || error.message || 'Unable to reset password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo">
                    <img src={logo} alt="OMODA | JAECOO" style={{ width: '180px', height: 'auto', marginBottom: '1rem' }} />
                    <p>Set New Password</p>
                </div>
                {valid && (
                    <form onSubmit={submit}>
                        <div className="form-group">
                            <label className="form-label">Password</label>
                            <input className="form-input" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Confirm Password</label>
                            <input className="form-input" type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} required />
                        </div>
                        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
                            {loading ? 'Saving...' : 'Reset Password'}
                        </button>
                    </form>
                )}
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                    <Link to="/login">Back to login</Link>
                </div>
            </div>
        </div>
    );
}

export default ResetPassword;
