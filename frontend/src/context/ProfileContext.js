import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { profileAPI } from '../services/api';
import toast from 'react-hot-toast';
import { showApiSuccess, showApiError, getErrorMessage } from '../utils/toastResponse';
import eventBus from '../utils/eventBus';
import { getAvatarUrl } from '../utils/assetUrl';

const ProfileContext = createContext(null);

const normalizeAvatarUrl = getAvatarUrl;

export function ProfileProvider({ children }) {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);

    const loadProfile = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await profileAPI.getProfile();
            if (res.data.success) {
                const data = { ...res.data.data, avatar: normalizeAvatarUrl(res.data.data.avatar) };
                setProfile(data);
            }
            return res.data;
        } catch (err) {
            const msg = err.response?.data?.message || 'Failed to load profile';
            setError(msg);
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const clearProfile = () => {
            setProfile(null);
            setError(null);
            setLoading(false);
            setSaving(false);
            setUploading(false);
        };
        eventBus.on('auth:logout', clearProfile);
        eventBus.on('auth:login', loadProfile);
        return () => {
            eventBus.remove('auth:logout', clearProfile);
            eventBus.remove('auth:login', loadProfile);
        };
    }, [loadProfile]);

    const saveProfile = useCallback(async (formData) => {
        try {
            setSaving(true);
            const res = await profileAPI.updateProfile(formData);
            if (res?.data?.success === true) {
                const data = { ...res.data.data, avatar: normalizeAvatarUrl(res.data.data.avatar) };
                setProfile(data);
                eventBus.dispatch('profile:updated', { avatar: data.avatar, user: data });
                showApiSuccess(res, 'Profile updated successfully');
                return { success: true, data };
            }
            throw new Error(res?.data?.message || 'Failed to update profile');
        } catch (err) {
            showApiError(err, 'Failed to update profile');
            return { success: false, message: getErrorMessage(err, 'Failed to update profile') };
        } finally {
            setSaving(false);
        }
    }, []);

    const uploadAvatar = useCallback(async (file) => {
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file');
            return { success: false };
        }
        if (file.size > 2 * 1024 * 1024) {
            toast.error('Image must be less than 2MB');
            return { success: false };
        }

        const formData = new FormData();
        formData.append('avatar', file);

        try {
            setUploading(true);
            const res = await profileAPI.uploadAvatar(formData);
            if (res.data.success) {
                const avatarUrl = normalizeAvatarUrl(res.data.data.avatar);
                setProfile(prev => ({ ...prev, avatar: avatarUrl }));
                eventBus.dispatch('profile:updated', { avatar: avatarUrl, user: res.data.data });
                showApiSuccess(res, 'Avatar updated successfully');
                return { success: true, url: avatarUrl };
            }
            throw new Error(res.data?.message || 'Failed to upload avatar');
        } catch (err) {
            showApiError(err, 'Failed to upload avatar');
            return { success: false, message: getErrorMessage(err, 'Failed to upload avatar') };
        } finally {
            setUploading(false);
        }
    }, []);

    const deleteAvatar = useCallback(async () => {
        try {
            setUploading(true);
            const res = await profileAPI.deleteAvatar();
            if (res.data.success) {
                setProfile(prev => ({ ...prev, avatar: '' }));
                eventBus.dispatch('profile:updated', { avatar: '', user: res.data.data });
                showApiSuccess(res, 'Avatar deleted successfully');
                return { success: true };
            }
            throw new Error(res.data?.message || 'Failed to delete avatar');
        } catch (err) {
            showApiError(err, 'Failed to delete avatar');
            return { success: false, message: getErrorMessage(err, 'Failed to delete avatar') };
        } finally {
            setUploading(false);
        }
    }, []);

    const discardChanges = useCallback(() => {
        loadProfile().catch(() => {});
    }, [loadProfile]);

    const value = useMemo(() => ({
        profile,
        loading,
        saving,
        uploading,
        error,
        loadProfile,
        saveProfile,
        uploadAvatar,
        deleteAvatar,
        discardChanges
    }), [profile, loading, saving, uploading, error, loadProfile, saveProfile, uploadAvatar, deleteAvatar, discardChanges]);

    return (
        <ProfileContext.Provider value={value}>
            {children}
        </ProfileContext.Provider>
    );
}

export const useProfile = () => useContext(ProfileContext);

export default ProfileContext;
