/**
 * Vehicle Branding Form Component
 * Modal form for creating and editing vehicle brands
 * Created by LOGIXINVENTOR (PVT) Ltd.
 * www.logixinventor.com | AMS
 * Date: 2026-05-08
 */

import React, { useState, useEffect } from 'react';
import useModalKeyboard from '../hooks/useModalKeyboard';
import './VehicleBrandingForm.css';

const VehicleBrandingForm = ({
    isOpen,
    isLoading,
    isEditMode = false,
    brandData = null,
    onSubmit,
    onCancel
}) => {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        logo_url: '',
        country_of_origin: '',
        established_year: new Date().getFullYear(),
        website: '',
        is_active: true
    });

    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});

    // Populate form when editing
    useEffect(() => {
        if (isEditMode && brandData) {
            setFormData({
                name: brandData.name || '',
                description: brandData.description || '',
                logo_url: brandData.logo_url || '',
                country_of_origin: brandData.country_of_origin || '',
                established_year: brandData.established_year || new Date().getFullYear(),
                website: brandData.website || '',
                is_active: brandData.is_active !== undefined ? brandData.is_active : true
            });
        } else {
            setFormData({
                name: '',
                description: '',
                logo_url: '',
                country_of_origin: '',
                established_year: new Date().getFullYear(),
                website: '',
                is_active: true
            });
        }
        setErrors({});
        setTouched({});
    }, [isOpen, isEditMode, brandData]);

    // Validation logic
    const validateForm = () => {
        const newErrors = {};

        if (!formData.name.trim()) {
            newErrors.name = 'Brand name is required';
        } else if (formData.name.trim().length < 2) {
            newErrors.name = 'Brand name must be at least 2 characters';
        } else if (formData.name.trim().length > 100) {
            newErrors.name = 'Brand name must not exceed 100 characters';
        }

        if (formData.description && formData.description.length > 500) {
            newErrors.description = 'Description must not exceed 500 characters';
        }

        if (formData.website) {
            const urlPattern = /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;
            if (!urlPattern.test(formData.website)) {
                newErrors.website = 'Please enter a valid website URL';
            }
        }

        if (formData.country_of_origin && formData.country_of_origin.length > 50) {
            newErrors.country_of_origin = 'Country name must not exceed 50 characters';
        }

        const currentYear = new Date().getFullYear();
        if (formData.established_year) {
            const year = parseInt(formData.established_year);
            if (year < 1800 || year > currentYear) {
                newErrors.established_year = `Year must be between 1800 and ${currentYear}`;
            }
        }

        return newErrors;
    };

    // Handle field change
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));

        // Clear error when user starts typing
        if (errors[name]) {
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[name];
                return newErrors;
            });
        }
    };

    // Handle field blur
    const handleBlur = (e) => {
        const { name } = e.target;
        setTouched(prev => ({
            ...prev,
            [name]: true
        }));
    };

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();

        const newErrors = validateForm();
        setErrors(newErrors);

        if (Object.keys(newErrors).length === 0) {
            try {
                await onSubmit(formData);
            } catch (error) {
                console.error('Form submission error:', error);
            }
        }
    };

    useModalKeyboard(isOpen, onCancel, handleSubmit, isLoading);

    if (!isOpen) return null;

    return (
        <div className="form-modal-overlay" onClick={onCancel}>
            <div className="form-modal-content" onClick={(e) => e.stopPropagation()}>
                {/* Modal Header */}
                <div className="form-modal-header">
                    <h2>{isEditMode ? '✎ Edit Vehicle Brand' : '+ New Vehicle Brand'}</h2>
                    <button
                        className="btn-close"
                        onClick={onCancel}
                        aria-label="Close modal"
                    >
                        ✕
                    </button>
                </div>

                {/* Modal Body */}
                <form className="form-modal-body" onSubmit={handleSubmit}>
                    <div className="form-grid">
                        {/* Brand Name */}
                        <div className="form-group full-width">
                            <label htmlFor="name">
                                Brand Name <span className="required">*</span>
                            </label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                placeholder="e.g., Toyota, Honda, BMW"
                                className={`form-input ${errors.name ? 'input-error' : ''}`}
                                maxLength="100"
                            />
                            {errors.name && <span className="error-text">{errors.name}</span>}
                            <span className="char-count">{formData.name.length}/100</span>
                        </div>

                        {/* Description */}
                        <div className="form-group full-width">
                            <label htmlFor="description">Description</label>
                            <textarea
                                id="description"
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                placeholder="Enter brand description (optional)"
                                className={`form-textarea ${errors.description ? 'input-error' : ''}`}
                                maxLength="500"
                                rows="4"
                            />
                            {errors.description && <span className="error-text">{errors.description}</span>}
                            <span className="char-count">{formData.description.length}/500</span>
                        </div>

                        {/* Country of Origin */}
                        <div className="form-group">
                            <label htmlFor="country_of_origin">Country of Origin</label>
                            <input
                                type="text"
                                id="country_of_origin"
                                name="country_of_origin"
                                value={formData.country_of_origin}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                placeholder="e.g., Japan, Germany, USA"
                                className={`form-input ${errors.country_of_origin ? 'input-error' : ''}`}
                                maxLength="50"
                            />
                            {errors.country_of_origin && <span className="error-text">{errors.country_of_origin}</span>}
                        </div>

                        {/* Established Year */}
                        <div className="form-group">
                            <label htmlFor="established_year">Established Year</label>
                            <input
                                type="number"
                                id="established_year"
                                name="established_year"
                                value={formData.established_year}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                placeholder="e.g., 1937"
                                className={`form-input ${errors.established_year ? 'input-error' : ''}`}
                                min="1800"
                                max={new Date().getFullYear()}
                            />
                            {errors.established_year && <span className="error-text">{errors.established_year}</span>}
                        </div>

                        {/* Website */}
                        <div className="form-group full-width">
                            <label htmlFor="website">Website</label>
                            <input
                                type="text"
                                id="website"
                                name="website"
                                value={formData.website}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                placeholder="https://www.example.com"
                                className={`form-input ${errors.website ? 'input-error' : ''}`}
                            />
                            {errors.website && <span className="error-text">{errors.website}</span>}
                        </div>

                        {/* Logo URL */}
                        <div className="form-group full-width">
                            <label htmlFor="logo_url">Logo URL</label>
                            <input
                                type="text"
                                id="logo_url"
                                name="logo_url"
                                value={formData.logo_url}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                placeholder="https://example.com/logo.png"
                                className="form-input"
                            />
                            {formData.logo_url && (
                                <div className="logo-preview">
                                    <img
                                        src={formData.logo_url}
                                        alt="Logo preview"
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                            e.target.nextElementSibling.style.display = 'flex';
                                        }}
                                    />
                                    <div className="preview-error" style={{ display: 'none' }}>
                                        Invalid image URL
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Active Status */}
                        {isEditMode && (
                            <div className="form-group checkbox-group">
                                <label htmlFor="is_active" className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        id="is_active"
                                        name="is_active"
                                        checked={formData.is_active}
                                        onChange={handleChange}
                                        className="checkbox-input"
                                    />
                                    <span>Active Brand</span>
                                </label>
                            </div>
                        )}
                    </div>
                </form>

                {/* Modal Footer */}
                <div className="form-modal-footer">
                    <button
                        className="btn btn-cancel"
                        onClick={onCancel}
                        disabled={isLoading}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn btn-save"
                        onClick={handleSubmit}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <span className="spinner-small"></span>
                                {isEditMode ? 'Updating...' : 'Creating...'}
                            </>
                        ) : (
                            isEditMode ? '✓ Update Brand' : '✓ Create Brand'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VehicleBrandingForm;
