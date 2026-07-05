import toast from 'react-hot-toast';

export function showApiSuccess(response, fallback = 'Operation successful') {
  if (response?.data?.success === true && !response?.data?.warning) {
    toast.success(response?.data?.message || fallback);
  }
}

export function showApiWarning(response, fallback = 'Warning') {
  if (response?.data?.warning) {
    toast(response?.data?.message || fallback, { icon: '⚠️' });
  }
}

const isPermissionDenied = (error) => error?.response?.status === 403 || error?.status === 403;

export function showApiError(error, fallback = 'Something went wrong') {
  if (isPermissionDenied(error)) return;
  const message = error?.response?.data?.message || error?.message || fallback;
  toast.error(message);
}

export function handleApiToast(response, successFallback) {
  if (!response) return;
  const data = response?.data || response;
  if (!data) return;
  if (data.warning) {
    toast(data.message || 'Warning', { icon: '⚠️' });
    return;
  }
  if (data.success) {
    toast.success(data.message || successFallback || 'Success');
  } else {
    toast.error(data.message || 'Operation failed');
  }
}

export function getErrorMessage(error, fallback = 'Something went wrong') {
  if (isPermissionDenied(error)) {
    return 'You do not have permission to view this resource.';
  }
  return error?.response?.data?.message || error?.message || fallback;
}
