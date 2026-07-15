import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { serverManagementAPI } from '../services/api';
import { showApiSuccess, showApiError, getErrorMessage } from '../utils/toastResponse';
import eventBus from '../utils/eventBus';

const defaultBranding = {
    applicationName: 'OMODA | JAECOO',
    browserTitle: 'AMSERP',
    activeTheme: 'default',
    favicon: null,
    sidebarLogo: null,
    sidebarBackgroundImage: null,
    sidebarBackgroundType: 'gradient',
    sidebarBackgroundColor: '#1e3a5f',
    sidebarGradientFrom: '#1e3a5f',
    sidebarGradientTo: '#0f172a',
    sidebarGradientAngle: 180,
    sidebarBackgroundSize: 'cover',
    sidebarBackgroundPosition: 'center center',
    sidebarBackgroundRepeat: 'no-repeat',
    sidebarOverlayColor: '#0f172a',
    sidebarOverlayOpacity: 0.2,
    sidebarTextColor: '#e2e8f0',
    sidebarHeadingColor: '#ffffff',
    sidebarActiveColor: '#2563eb',
    loginLogo: null,
    loadingLogo: null
};

const BrandingContext = createContext(null);

const ensureIconLink = () => {
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    return link;
};

export const BrandingProvider = ({ children }) => {
    const [branding, setBranding] = useState(defaultBranding);
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const applyBranding = useCallback((nextBranding = defaultBranding) => {
        const merged = { ...defaultBranding, ...nextBranding };
        setBranding(merged);
        document.title = merged.browserTitle || merged.applicationName || defaultBranding.browserTitle;

        const faviconUrl = merged.favicon?.publicUrl || merged.favicon?.url;
        if (faviconUrl) {
            ensureIconLink().href = faviconUrl;
        }
    }, []);

    const refreshBranding = useCallback(async () => {
        try {
            setLoading(true);
            const response = await serverManagementAPI.getBranding();
            const data = response.data?.data || {};
            applyBranding(data.setting || defaultBranding);
            setAssets(data.assets || []);
            return data;
        } catch (err) {
            const msg = getErrorMessage(err, 'Failed to load branding');
            setError(msg);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [applyBranding]);

    useEffect(() => {
        refreshBranding().catch(() => {
            applyBranding(defaultBranding);
        });
        const reset = () => {
            setAssets([]);
            setError(null);
            applyBranding(defaultBranding);
            refreshBranding().catch(() => {});
        };
        eventBus.on('auth:logout', reset);
        eventBus.on('auth:login', refreshBranding);
        return () => {
            eventBus.remove('auth:logout', reset);
            eventBus.remove('auth:login', refreshBranding);
        };
    }, [applyBranding, refreshBranding]);

    const saveBranding = useCallback(async (brandingDraft) => {
        try {
            const payload = {
                applicationName: brandingDraft.applicationName,
                browserTitle: brandingDraft.browserTitle,
                activeTheme: brandingDraft.activeTheme,
                favicon: brandingDraft.favicon?._id || brandingDraft.favicon || null,
                sidebarLogo: brandingDraft.sidebarLogo?._id || brandingDraft.sidebarLogo || null,
                loginLogo: brandingDraft.loginLogo?._id || brandingDraft.loginLogo || null,
                loadingLogo: brandingDraft.loadingLogo?._id || brandingDraft.loadingLogo || null,
                sidebarBackgroundImage: brandingDraft.sidebarBackgroundImage?._id || brandingDraft.sidebarBackgroundImage || null,
                sidebarBackgroundType: brandingDraft.sidebarBackgroundType,
                sidebarBackgroundColor: brandingDraft.sidebarBackgroundColor,
                sidebarGradientFrom: brandingDraft.sidebarGradientFrom,
                sidebarGradientTo: brandingDraft.sidebarGradientTo,
                sidebarGradientAngle: Number(brandingDraft.sidebarGradientAngle ?? 180),
                sidebarBackgroundSize: brandingDraft.sidebarBackgroundSize,
                sidebarBackgroundPosition: brandingDraft.sidebarBackgroundPosition,
                sidebarBackgroundRepeat: brandingDraft.sidebarBackgroundRepeat,
                sidebarOverlayColor: brandingDraft.sidebarOverlayColor,
                sidebarOverlayOpacity: Number(brandingDraft.sidebarOverlayOpacity ?? 0.2),
                sidebarTextColor: brandingDraft.sidebarTextColor,
                sidebarHeadingColor: brandingDraft.sidebarHeadingColor,
                sidebarActiveColor: brandingDraft.sidebarActiveColor
            };
            const response = await serverManagementAPI.updateBranding(payload);
            if (!(response?.status >= 200 && response?.status < 300 && response?.data?.success === true)) {
                throw new Error(response?.data?.message || 'Failed to save branding');
            }
            const nextBranding = response.data?.data?.setting || brandingDraft;
            const nextAssets = response.data?.data?.assets || [];
            applyBranding(nextBranding);
            setAssets(nextAssets);
            showApiSuccess(response, 'Branding saved');
            return { success: true, data: { setting: nextBranding, assets: nextAssets } };
        } catch (err) {
            showApiError(err, 'Unable to save branding');
            return { success: false, message: getErrorMessage(err, 'Unable to save branding') };
        }
    }, [applyBranding]);

    const loadAssets = useCallback(async () => {
        try {
            const response = await serverManagementAPI.getBranding();
            const data = response.data?.data || {};
            setAssets(data.assets || []);
            return data.assets;
        } catch (err) {
            const msg = getErrorMessage(err, 'Failed to load assets');
            setError(msg);
            throw err;
        }
    }, []);

    const uploadAssets = useCallback(async (files) => {
        if (!files?.length) return { success: false };
        const formData = new FormData();
        files.forEach((file) => formData.append('assets', file));

        try {
            const response = await serverManagementAPI.uploadAssets(formData);
            if (!(response?.status >= 200 && response?.status < 300 && response?.data?.success === true)) {
                throw new Error(response?.data?.message || 'Failed to upload assets');
            }
            const uploaded = response.data?.data?.assets || [];
            setAssets(prev => [...uploaded, ...prev]);
            showApiSuccess(response, 'Assets uploaded');
            return { success: true, assets: uploaded };
        } catch (err) {
            showApiError(err, 'Unable to upload assets');
            return { success: false, message: getErrorMessage(err, 'Unable to upload assets') };
        }
    }, []);

    const deleteAsset = useCallback(async (id) => {
        try {
            const response = await serverManagementAPI.deleteAsset(id);
            if (response?.data?.success === true) {
                const data = response.data?.data || {};
                if (data.setting) applyBranding(data.setting);
                setAssets(data.assets || assets.filter(a => a._id !== id));
                showApiSuccess(response, 'Asset deleted');
                return { success: true };
            }
            throw new Error(response?.data?.message || 'Failed to delete asset');
        } catch (err) {
            showApiError(err, 'Unable to delete asset');
            return { success: false, message: getErrorMessage(err, 'Unable to delete asset') };
        }
    }, [applyBranding, assets]);

    const replaceAsset = useCallback(async (id, file) => {
        if (!file) return { success: false };
        const formData = new FormData();
        formData.append('asset', file);

        try {
            const response = await serverManagementAPI.replaceAsset(id, formData);
            if (response?.data?.success === true) {
                const updated = response.data?.data?.asset;
                const data = response.data?.data || {};
                if (data.setting) applyBranding(data.setting);
                if (data.assets) setAssets(data.assets);
                else if (updated) setAssets(prev => prev.map(a => a._id === id ? { ...a, ...updated } : a));
                showApiSuccess(response, 'Asset replaced');
                return { success: true, asset: updated };
            }
            throw new Error(response?.data?.message || 'Failed to replace asset');
        } catch (err) {
            showApiError(err, 'Unable to replace asset');
            return { success: false, message: getErrorMessage(err, 'Unable to replace asset') };
        }
    }, [applyBranding]);

    const value = useMemo(() => ({
        branding,
        assets,
        loading,
        error,
        setAssets,
        applyBranding,
        refreshBranding,
        saveBranding,
        loadAssets,
        uploadAssets,
        deleteAsset,
        replaceAsset
    }), [branding, assets, loading, error, applyBranding, refreshBranding, saveBranding, loadAssets, uploadAssets, deleteAsset, replaceAsset]);

    return (
        <BrandingContext.Provider value={value}>
            {children}
        </BrandingContext.Provider>
    );
};

export const useBranding = () => useContext(BrandingContext);
export default BrandingContext;
