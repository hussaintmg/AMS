import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authAPI } from '../services/api';
import logo from '../assets/logo.png';
import { showApiError, showApiSuccess, getErrorMessage } from '../utils/toastResponse';

const isSuccess = (res) => res?.status >= 200 && res?.status < 300 && res?.data?.success === true;

function ForgotPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [tokenValid, setTokenValid] = useState(!token);
    const [digits, setDigits] = useState(['', '', '', '', '', '']);
    const inputRefs = useRef([]);

    useEffect(() => {
        const validateToken = async () => {
            if (!token) return;
            try {
                await authAPI.checkForgotToken({ token });
                setTokenValid(true);
            } catch {
                toast.error('Reset link expired. Request a new code.');
                navigate('/forgot-password', { replace: true });
            }
        };
        validateToken();
    }, [token, navigate]);

    const submitEmail = async (event) => {
        event.preventDefault();
        setLoading(true);
        try {
            const res = await authAPI.forgotPassword({ email });
            if (!isSuccess(res)) throw new Error(res.data?.message || 'Unable to start password reset');
            const forgotToken = res.data.data?.forgotToken;
            const devCode = res.data.data?.code;
            if (devCode) toast.success(`Code generated: ${devCode}`);
            else showApiSuccess(res, 'Please check your email for the password reset code.');
            if (forgotToken) {
                navigate(`/forgot-password?token=${forgotToken}`, { replace: true });
            }
        } catch (error) {
            showApiError(error, 'Unable to start password reset');
        } finally {
            setLoading(false);
        }
    };

    const setDigit = (index, value) => {
        const digit = value.replace(/\D/g, '').slice(-1);
        setDigits((prev) => prev.map((item, i) => i === index ? digit : item));
        if (digit && index < 5) inputRefs.current[index + 1]?.focus();
    };

    const handlePaste = (event) => {
        const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasted.length !== 6) return;
        event.preventDefault();
        setDigits(pasted.split(''));
        inputRefs.current[5]?.focus();
    };

    const submitCode = async (event) => {
        event.preventDefault();
        const code = digits.join('');
        if (code.length !== 6) {
            toast.error('Enter the 6 digit code');
            return;
        }
        setLoading(true);
        try {
            const res = await authAPI.checkResetCode({ token, code });
            if (!isSuccess(res)) throw new Error(res.data?.message || 'Invalid code');
            navigate(`/reset-password?token=${res.data.data.resetToken}`);
        } catch (error) {
            showApiError(error, 'Invalid code');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo">
                    <img src={logo} alt="OMODA | JAECOO" style={{ width: '180px', height: 'auto', marginBottom: '1rem' }} />
                    <p>Password Recovery</p>
                </div>

                {!token ? (
                    <form onSubmit={submitEmail}>
                        <div className="form-group">
                            <label className="form-label">Email Address</label>
                            <input className="form-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                        </div>
                        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
                            {loading ? 'Sending...' : 'Send Reset Code'}
                        </button>
                    </form>
                ) : tokenValid ? (
                    <form onSubmit={submitCode}>
                        <div className="form-group">
                            <label className="form-label">Enter 6 Digit Code</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem' }}>
                                {digits.map((digit, index) => (
                                    <input
                                        key={index}
                                        ref={(el) => { inputRefs.current[index] = el; }}
                                        className="form-input"
                                        value={digit}
                                        maxLength="1"
                                        inputMode="numeric"
                                        style={{ textAlign: 'center', fontWeight: 700 }}
                                        onChange={(event) => setDigit(index, event.target.value)}
                                        onPaste={handlePaste}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Backspace' && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
                            {loading ? 'Verifying...' : 'Verify Code'}
                        </button>
                    </form>
                ) : null}

                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                    <Link to="/login">Back to login</Link>
                </div>
            </div>
        </div>
    );
}

export default ForgotPassword;
