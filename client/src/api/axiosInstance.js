// src/api/axiosInstance.js
import axios from 'axios';
import { requestApproval } from '../approvalBridge';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL,
    withCredentials: true, // sends/receives the httpOnly refresh-token cookie
});

// Add token to every request if available
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Silent-refresh on a 401: the access token is short-lived (15 min) by
// design, so an expired-token 401 is an expected, routine event — not a
// real auth failure — as long as the refresh cookie is still valid. Retries
// the original request exactly once after a successful refresh; anything
// else (refresh itself 401s, or a non-401 error) passes through untouched.
let refreshPromise = null;

async function refreshAccessToken() {
    const res = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true }
    );
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    return res.data.token;
}

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const { config, response } = error;
        if (response?.status !== 401 || config._retried || config.url?.includes('/auth/login') || config.url?.includes('/auth/refresh')) {
            return Promise.reject(error);
        }
        config._retried = true;

        try {
            refreshPromise = refreshPromise || refreshAccessToken();
            const newToken = await refreshPromise;
            config.headers.Authorization = `Bearer ${newToken}`;
            return api(config);
        } catch (refreshErr) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/'; // the login page lives at the root route
            return Promise.reject(refreshErr);
        } finally {
            refreshPromise = null;
        }
    }
);

// Manager override: when the server says a request needs an admin's
// approval (e.g. a discount over the cashier's limit), ask for it via the
// <ApprovalPrompt /> modal and resend the same request with it attached.
// Up to 3 tries for a mistyped PIN; cancelling rejects with the original error.
const MAX_APPROVAL_TRIES = 3;
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const { config, response } = error;
        const code = response?.data?.code;
        if (response?.status !== 403 || (code !== 'APPROVAL_REQUIRED' && code !== 'APPROVAL_INVALID') || !config) {
            return Promise.reject(error);
        }
        const tries = config._approvalTries || 0;
        if (tries >= MAX_APPROVAL_TRIES) return Promise.reject(error);

        const approval = await requestApproval(response.data.error, { invalid: code === 'APPROVAL_INVALID' });
        if (!approval) return Promise.reject(error);

        const original = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : (config.data || {});
        return api({ ...config, data: { ...original, approval }, _approvalTries: tries + 1 });
    }
);

export default api;
