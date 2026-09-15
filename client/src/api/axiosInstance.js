// src/api/axiosInstance.js
import axios from 'axios';

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
            window.location.href = '/login';
            return Promise.reject(refreshErr);
        } finally {
            refreshPromise = null;
        }
    }
);

export default api;
