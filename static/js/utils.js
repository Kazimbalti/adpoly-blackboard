/* ===== API Client & Utilities ===== */
const API_BASE = '/api';

const AppState = {
    user: null,
    token: null,
    refreshToken: null,
    theme: localStorage.getItem('theme') || 'light',
};

function getToken() {
    return localStorage.getItem('access_token');
}

function setTokens(access, refresh) {
    localStorage.setItem('access_token', access);
    if (refresh) localStorage.setItem('refresh_token', refresh);
    AppState.token = access;
    AppState.refreshToken = refresh;
}

function clearTokens() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    AppState.user = null;
    AppState.token = null;
}

function getUser() {
    if (AppState.user) return AppState.user;
    const stored = localStorage.getItem('user');
    if (stored) {
        AppState.user = JSON.parse(stored);
        return AppState.user;
    }
    return null;
}

function setUser(user) {
    AppState.user = user;
    localStorage.setItem('user', JSON.stringify(user));
}

async function api(endpoint, options = {}) {
    const token = getToken();
    const headers = {
        ...(options.headers || {}),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
        });

        if (res.status === 401 && token) {
            const refreshed = await refreshTokens();
            if (refreshed) {
                headers['Authorization'] = `Bearer ${getToken()}`;
                const retry = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
                return await retry.json();
            } else {
                clearTokens();
                window.location.hash = '#/login';
                return { error: 'Session expired' };
            }
        }

        return await res.json();
    } catch (err) {
        console.error('API Error:', err);
        return { error: 'Network error. Please try again.' };
    }
}

async function refreshTokens() {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return false;

    try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        setTokens(data.access_token, data.refresh_token);
        return true;
    } catch {
        return false;
    }
}

async function apiGet(endpoint) {
    return api(endpoint);
}

async function apiPost(endpoint, data) {
    return api(endpoint, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

async function apiPut(endpoint, data) {
    return api(endpoint, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

async function apiDelete(endpoint) {
    return api(endpoint, { method: 'DELETE' });
}

async function apiUpload(endpoint, formData) {
    return api(endpoint, {
        method: 'POST',
        body: formData,
    });
}

// DOM Helpers
function $(sel, parent = document) {
    return parent.querySelector(sel);
}

function $$(sel, parent = document) {
    return [...parent.querySelectorAll(sel)];
}

function el(tag, attrs = {}, children = []) {
    const elem = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) {
        if (key === 'className') elem.className = val;
        else if (key === 'innerHTML') elem.innerHTML = val;
        else if (key === 'textContent') elem.textContent = val;
        else if (key.startsWith('on')) elem.addEventListener(key.slice(2).toLowerCase(), val);
        else if (key === 'style' && typeof val === 'object') Object.assign(elem.style, val);
        else if (key === 'dataset') Object.assign(elem.dataset, val);
        else elem.setAttribute(key, val);
    }
    for (const child of children) {
        if (typeof child === 'string') elem.appendChild(document.createTextNode(child));
        else if (child) elem.appendChild(child);
    }
    return elem;
}

function setHTML(selector, html) {
    const target = typeof selector === 'string' ? $(selector) : selector;
    if (target) target.innerHTML = html;
}

function show(selector) {
    const target = typeof selector === 'string' ? $(selector) : selector;
    if (target) target.classList.remove('hidden');
}

function hide(selector) {
    const target = typeof selector === 'string' ? $(selector) : selector;
    if (target) target.classList.add('hidden');
}

function toggle(selector) {
    const target = typeof selector === 'string' ? $(selector) : selector;
    if (target) target.classList.toggle('hidden');
}

// Formatters
function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr + (dateStr.includes('Z') ? '' : 'Z'));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr + (dateStr.includes('Z') ? '' : 'Z'));
    return d.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit'
    });
}

function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + (dateStr.includes('Z') ? '' : 'Z'));
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return formatDate(dateStr);
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function formatTimer(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getInitials(firstName, lastName) {
    return ((firstName?.[0] || '') + (lastName?.[0] || '')).toUpperCase();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}
