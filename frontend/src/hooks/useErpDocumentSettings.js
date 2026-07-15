import { useEffect, useState } from 'react';
import { erpSettingsAPI, paymentMethodsAPI } from '../services/api';

let cachedPromise;
let cachedValue = { currencies: [], taxes: [], paymentMethods: [] };

function loadDocumentSettings() {
    if (!cachedPromise) {
        cachedPromise = Promise.allSettled([
            erpSettingsAPI.getCurrencies({ active: true }),
            erpSettingsAPI.getTaxes({ active: true }),
            paymentMethodsAPI.getAll({ status: 'active' }),
        ]).then(([currencies, taxes, paymentMethods]) => {
            cachedValue = {
                currencies: currencies.status === 'fulfilled' ? currencies.value?.data?.data || [] : [],
                taxes: taxes.status === 'fulfilled' ? taxes.value?.data?.data || [] : [],
                paymentMethods: paymentMethods.status === 'fulfilled' ? paymentMethods.value?.data?.data || [] : [],
            };
            return cachedValue;
        });
    }
    return cachedPromise;
}

export default function useErpDocumentSettings() {
    const [settings, setSettings] = useState(cachedValue);
    useEffect(() => {
        let mounted = true;
        loadDocumentSettings().then((value) => { if (mounted) setSettings(value); });
        return () => { mounted = false; };
    }, []);

    const currency = settings.currencies.find((item) => item.is_default) || settings.currencies[0] || { code: 'PKR', symbol: '₨', decimal_places: 2 };
    const taxes = settings.taxes.filter((item) => item.is_active !== false);
    const salesTax = taxes.find((item) => ['sales', 'vat', 'gst'].includes(item.tax_type)) || taxes[0] || null;
    const serviceTax = taxes.find((item) => item.tax_type === 'service') || salesTax;
    const taxAmount = (base, tax) => Math.round((Number(base || 0) * Number(tax?.tax_rate || 0) / 100) * 100) / 100;
    const money = (value) => `${currency.symbol || currency.code || '₨'} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: Number(currency.decimal_places || 2), maximumFractionDigits: Number(currency.decimal_places || 2) })}`;

    return { ...settings, currency, taxes, salesTax, serviceTax, taxAmount, money };
}
