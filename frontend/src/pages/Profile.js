import React, { useState, useEffect, useRef, useCallback } from 'react';
import SearchableSelect from '../components/SearchableSelect';
import { useProfile } from '../context/ProfileContext';
import useModalKeyboard from '../hooks/useModalKeyboard';
import '../styles/profile.css';

const statusBadgeClass = (status) => {
    const map = { active: 'badge-success', inactive: 'badge-danger', suspended: 'badge-warning' };
    return map[status] || 'badge-secondary';
};

function Profile() {
    const { profile, loading, saving, uploading, saveProfile, uploadAvatar, discardChanges, loadProfile } = useProfile();
    const [activeTab, setActiveTab] = useState('personal');
    const [avatarError, setAvatarError] = useState(false);
    const fileInputRef = useRef(null);

    const [formData, setFormData] = useState({
        bio: '',
        address: '',
        city: '',
        country: 'Pakistan',
        postal_code: '',
        date_of_birth: '',
        gender: '',
        emergency_contact_name: '',
        emergency_contact_phone: '',
        emergency_contact_relation: '',
        social_links: {
            linkedin: '',
            twitter: '',
            facebook: '',
            website: ''
        }
    });

    useEffect(() => {
        if (profile) {
            setAvatarError(false);
            setFormData({
                bio: profile.bio || '',
                address: profile.residential_address || profile.address || '',
                city: profile.city || '',
                country: profile.country || 'Pakistan',
                postal_code: profile.postal_code || '',
                date_of_birth: profile.date_of_birth ? profile.date_of_birth.split('T')[0] : '',
                gender: profile.gender || '',
                emergency_contact_name: profile.emergency_contact_name || '',
                emergency_contact_phone: profile.emergency_contact_phone || '',
                emergency_contact_relation: profile.emergency_contact_relation || '',
                social_links: profile.social_links || { linkedin: '', twitter: '', facebook: '', website: '' }
            });
        }
    }, [profile]);

    useModalKeyboard(true, () => {}, () => {
        const submitBtn = document.querySelector('.profile-container .btn-primary');
        if (submitBtn && !submitBtn.disabled) submitBtn.click();
    });

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        if (name.startsWith('social_')) {
            const socialKey = name.replace('social_', '');
            setFormData(prev => ({
                ...prev,
                social_links: {
                    ...prev.social_links,
                    [socialKey]: value
                }
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        await saveProfile(formData);
    };

    const handleAvatarUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const result = await uploadAvatar(file);
        if (result.success) {
            setAvatarError(false);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const joinedDisplay = () => {
        if (profile?.joining_date) {
            return new Date(profile.joining_date).toLocaleDateString();
        }
        if (profile?.createdAt) {
            return new Date(profile.createdAt).toLocaleDateString();
        }
        return 'N/A';
    };

    if (loading) {
        return (
            <div className="loading-overlay">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="profile-container">
            <header className="page-header">
                <div>
                    <h1 className="page-title">User Profile</h1>
                    <p style={{ color: 'var(--gray-500)', fontSize: '14px', marginTop: '4px' }}>
                        Manage your corporate identity and personal preferences
                    </p>
                </div>
                <div className="header-actions" style={{ gap: '12px' }}>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={discardChanges}
                        disabled={saving}
                    >
                        Discard
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleSubmit}
                        disabled={saving}
                    >
                        {saving ? (
                            <>
                                <span className="spinner-mini"></span>
                                Saving...
                            </>
                        ) : 'Save Changes'}
                    </button>
                </div>
            </header>

            <div className="profile-grid">
                <aside className="profile-sidebar-card">
                    <div className="profile-avatar-wrapper">
                        <div className="profile-avatar-large">
                            {profile?.avatar && !avatarError ? (
                                <img
                                    src={profile.avatar}
                                    alt=""
                                    onError={() => setAvatarError(true)}
                                    style={{ width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' }}
                                />
                            ) : (
                                <>{profile?.first_name?.[0]}{profile?.last_name?.[0]}</>
                            )}
                        </div>
                        <button
                            className="avatar-edit-btn"
                            title="Change Avatar"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                        >
                            {uploading ? (
                                <span className="spinner-mini"></span>
                            ) : (
                                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            )}
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                            style={{ display: 'none' }}
                        />
                    </div>

                    <h2 className="profile-user-name">{profile?.full_name}</h2>
                    <p className="profile-user-role">{profile?.role_display_name} • {profile?.department_name || `${profile?.role_name==="super_admin" ? 'Owner' : 'Organization'}`}</p>

                    <div className="profile-stats-mini">
                        <div className="mini-stat-item">
                            <span className="mini-stat-label">Status</span>
                            <span className={`badge ${statusBadgeClass(profile?.employee_status) || 'badge-success'}`}>
                                {profile?.employee_status ? profile.employee_status.charAt(0).toUpperCase() + profile.employee_status.slice(1) : 'Active'}
                            </span>
                        </div>
                        <div className="mini-stat-item">
                            <span className="mini-stat-label">Joined</span>
                            <span className="mini-stat-value">{joinedDisplay()}</span>
                        </div>
                    </div>
                </aside>

                <main className="profile-main-card">
                    <nav className="profile-tabs-nav">
                        <button
                            className={`profile-tab-btn ${activeTab === 'personal' ? 'active' : ''}`}
                            onClick={() => setActiveTab('personal')}
                        >
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            Personal Information
                        </button>
                        <button
                            className={`profile-tab-btn ${activeTab === 'social' ? 'active' : ''}`}
                            onClick={() => setActiveTab('social')}
                        >
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            Social & Emergency
                        </button>
                    </nav>

                    <div className="profile-tab-content">
                        <form className="profile-form" onSubmit={handleSubmit}>
                            {activeTab === 'personal' && (
                                <>
                                    <div className="form-group col-span-full">
                                        <label className="form-label">Professional Bio</label>
                                        <textarea
                                            name="bio"
                                            className="profile-bio-textarea"
                                            placeholder="Tell us about your professional background..."
                                            value={formData.bio}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Gender</label>
                                        <SearchableSelect
                                            name="gender"
                                            className="form-select"
                                            value={formData.gender}
                                            onChange={handleInputChange}
                                        >
                                            <option value="">Select Gender</option>
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                            <option value="other">Other</option>
                                        </SearchableSelect>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Date of Birth</label>
                                        <input
                                            type="date"
                                            name="date_of_birth"
                                            className="form-input"
                                            value={formData.date_of_birth}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    <div className="form-group col-span-full">
                                        <label className="form-label">Residential Address</label>
                                        <input
                                            type="text"
                                            name="address"
                                            className="form-input"
                                            value={formData.address}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">City</label>
                                        <input
                                            type="text"
                                            name="city"
                                            className="form-input"
                                            value={formData.city}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Postal Code</label>
                                        <input
                                            type="text"
                                            name="postal_code"
                                            className="form-input"
                                            value={formData.postal_code}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                </>
                            )}

                            {activeTab === 'social' && (
                                <>
                                    <h3 className="section-title">Emergency Contact Information</h3>
                                    <div className="form-group">
                                        <label className="form-label">Contact Name</label>
                                        <input
                                            type="text"
                                            name="emergency_contact_name"
                                            className="form-input"
                                            value={formData.emergency_contact_name}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Contact Phone</label>
                                        <input
                                            type="text"
                                            name="emergency_contact_phone"
                                            className="form-input"
                                            value={formData.emergency_contact_phone}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Relationship</label>
                                        <input
                                            type="text"
                                            name="emergency_contact_relation"
                                            className="form-input"
                                            placeholder="e.g. Spouse, Parent"
                                            value={formData.emergency_contact_relation}
                                            onChange={handleInputChange}
                                        />
                                    </div>

                                    <h3 className="section-title">Social Profiles</h3>
                                    <div className="form-group">
                                        <label className="form-label">LinkedIn URL</label>
                                        <input
                                            type="url"
                                            name="social_linkedin"
                                            className="form-input"
                                            value={formData.social_links.linkedin}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Twitter URL</label>
                                        <input
                                            type="url"
                                            name="social_twitter"
                                            className="form-input"
                                            value={formData.social_links.twitter}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Facebook URL</label>
                                        <input
                                            type="url"
                                            name="social_facebook"
                                            className="form-input"
                                            value={formData.social_links.facebook}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Website URL</label>
                                        <input
                                            type="url"
                                            name="social_website"
                                            className="form-input"
                                            value={formData.social_links.website}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                </>
                            )}
                        </form>
                    </div>
                </main>
            </div>
        </div>
    );
}

export default Profile;
