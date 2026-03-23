/* ===== Main App - Router & Navigation ===== */
const App = {
    init() {
        this.setupTheme();
        this.setupRouter();
        this.setupEventListeners();
        this.route();
    },

    setupTheme() {
        const theme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        this.updateThemeIcons(theme);
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        this.updateThemeIcons(next);
    },

    updateThemeIcons(theme) {
        const sun = $('#icon-sun');
        const moon = $('#icon-moon');
        if (sun && moon) {
            if (theme === 'dark') { hide(sun); show(moon); }
            else { show(sun); hide(moon); }
        }
    },

    setupRouter() {
        window.addEventListener('hashchange', () => this.route());
    },

    setupEventListeners() {
        // Theme toggle
        const themeBtn = $('#btn-theme');
        if (themeBtn) themeBtn.onclick = () => this.toggleTheme();

        // Logout
        const logoutBtn = $('#btn-logout');
        if (logoutBtn) logoutBtn.onclick = (e) => {
            e.preventDefault();
            this.logout();
        };

        // User dropdown
        const userBtn = $('#btn-user-menu');
        if (userBtn) userBtn.onclick = () => toggle('#user-dropdown');

        // Close dropdown on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#user-menu')) hide('#user-dropdown');
            if (!e.target.closest('#notification-panel') && !e.target.closest('#btn-notifications')) {
                const panel = $('#notification-panel');
                if (panel && !panel.classList.contains('hidden')) hide(panel);
            }
        });

        // Notifications
        const notifBtn = $('#btn-notifications');
        if (notifBtn) notifBtn.onclick = () => this.toggleNotifications();

        const closeNotif = $('#btn-close-notifications');
        if (closeNotif) closeNotif.onclick = () => hide('#notification-panel');

        // Messages nav
        const msgBtn = $('#btn-messages-nav');
        if (msgBtn) msgBtn.onclick = () => { window.location.hash = '#/messages'; };
    },

    async route() {
        const hash = window.location.hash || '#/login';
        const path = hash.slice(1); // remove #

        // Auth check
        const token = getToken();
        const publicRoutes = ['/login', '/register', '/forgot-password'];

        if (!token && !publicRoutes.includes(path)) {
            window.location.hash = '#/login';
            return;
        }

        if (token && publicRoutes.includes(path)) {
            window.location.hash = '#/dashboard';
            return;
        }

        // Show/hide nav and sidebar for auth pages
        if (publicRoutes.includes(path)) {
            hide('#main-nav');
            hide('#app-body');
            show('#auth-container');
            hide('#mobile-nav');
        } else {
            show('#main-nav');
            show('#app-body');
            hide('#auth-container');
            this.updateNavUser();
            this.renderSidebar();
        }

        // Route matching
        const segments = path.split('/').filter(Boolean);

        try {
            if (path === '/login') AuthModule.renderLogin();
            else if (path === '/register') AuthModule.renderRegister();
            else if (path === '/forgot-password') AuthModule.renderForgotPassword();
            else if (path === '/dashboard') DashboardModule.render();
            else if (path === '/courses') CoursesModule.renderList();
            else if (path === '/courses/browse') CoursesModule.renderBrowse();
            else if (path === '/courses/create') CoursesModule.showCreateForm();
            else if (segments[0] === 'courses' && segments[2] === 'students') CoursesModule.renderStudents(parseInt(segments[1]));
            else if (segments[0] === 'courses' && segments[2] === 'exams' && segments[3]) ExamsModule.startExam(parseInt(segments[3]));
            else if (segments[0] === 'courses' && segments.length === 2) CoursesModule.renderDetail(parseInt(segments[1]));
            else if (path === '/messages') MessagesModule.render();
            else if (segments[0] === 'messages' && segments[1]) MessagesModule.openConversation(parseInt(segments[1]));
            else if (path === '/grades') GradesModule.renderStudentAnalytics();
            else if (path === '/profile') this.renderProfile();
            else if (path === '/security') this.renderSecurity();
            else if (path === '/change-password') this.renderChangePassword();
            else DashboardModule.render();
        } catch (err) {
            console.error('Route error:', err);
            setHTML('#page-content', `<div class="empty-state"><h3>Something went wrong</h3><p>${err.message}</p></div>`);
        }

        // Update mobile nav active state
        this.updateMobileNav(path);
    },

    updateNavUser() {
        const user = getUser();
        if (!user) return;

        const avatar = $('#nav-avatar');
        const name = $('#nav-user-name');
        if (avatar) avatar.textContent = getInitials(user.first_name, user.last_name);
        if (name) name.textContent = user.first_name;
    },

    renderSidebar() {
        const user = getUser();
        if (!user) return;

        const isFaculty = user.role === 'faculty' || user.role === 'admin';

        let html = `
            <div class="sidebar-section">
                <div class="sidebar-label">Main</div>
                <a href="#/dashboard" class="sidebar-item ${location.hash === '#/dashboard' ? 'active' : ''}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                    Dashboard
                </a>
                <a href="#/courses" class="sidebar-item ${location.hash.startsWith('#/courses') ? 'active' : ''}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                    Courses
                </a>
                <a href="#/messages" class="sidebar-item ${location.hash === '#/messages' ? 'active' : ''}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    Messages
                </a>
                <a href="#/grades" class="sidebar-item ${location.hash === '#/grades' ? 'active' : ''}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                    ${isFaculty ? 'Gradebook' : 'My Grades'}
                </a>
            </div>
        `;

        // Quick course links
        apiGet('/courses/').then(data => {
            if (data.courses?.length) {
                let coursesHtml = '<div class="sidebar-section"><div class="sidebar-label">My Courses</div>';
                for (const c of data.courses.slice(0, 8)) {
                    coursesHtml += `
                        <a href="#/courses/${c.id}" class="sidebar-item">
                            <div class="sidebar-course-dot" style="background:${c.color || '#4A90D9'}"></div>
                            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(c.code)}</span>
                        </a>
                    `;
                }
                coursesHtml += '</div>';
                const menu = $('#sidebar-menu');
                if (menu) menu.innerHTML = html + coursesHtml;
            }
        });

        setHTML('#sidebar-menu', html);
    },

    updateMobileNav(path) {
        $$('.mobile-nav-item').forEach(item => {
            const page = item.dataset.page;
            item.classList.toggle('active', path.includes(page));
        });
    },

    async toggleNotifications() {
        const panel = $('#notification-panel');
        toggle(panel);

        if (!panel.classList.contains('hidden')) {
            const data = await apiGet('/dashboard/');
            const notifications = data.notifications || [];

            setHTML('#notification-list', notifications.length ? notifications.map(n => `
                <div class="notification-item ${n.is_read ? '' : 'unread'}" ${n.link ? `onclick="window.location.hash='${n.link}'; hide('#notification-panel')"` : ''} style="cursor:pointer">
                    ${!n.is_read ? '<div class="notification-dot"></div>' : '<div style="width:8px"></div>'}
                    <div class="notification-content">
                        <h4>${escapeHtml(n.title)}</h4>
                        ${n.body ? `<p>${escapeHtml(n.body)}</p>` : ''}
                    </div>
                    <div class="notification-time">${formatTimeAgo(n.created_at)}</div>
                </div>
            `).join('') : '<div class="empty-state"><p>No notifications</p></div>');
        }
    },

    async logout() {
        const refreshToken = localStorage.getItem('refresh_token');
        await apiPost('/auth/logout', { refresh_token: refreshToken });
        clearTokens();
        window.location.hash = '#/login';
        showToast('Signed out successfully', 'info');
    },

    renderProfile() {
        const user = getUser();
        setHTML('#page-content', `
            <div class="fade-in" style="max-width:600px;">
                <div class="page-header"><h1>Profile Settings</h1></div>
                <div class="card">
                    <div class="card-body">
                        <div class="text-center mb-3">
                            <div class="avatar avatar-lg" style="width:80px; height:80px; font-size:2rem; margin:0 auto;">${getInitials(user.first_name, user.last_name)}</div>
                            <h2 class="mt-1">${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}</h2>
                            <p class="text-secondary">${escapeHtml(user.email)}</p>
                            <span class="tag tag-primary">${user.role}</span>
                        </div>
                        <form id="profile-form">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>First Name</label>
                                    <input type="text" id="prof-first" class="form-control" value="${escapeHtml(user.first_name)}">
                                </div>
                                <div class="form-group">
                                    <label>Last Name</label>
                                    <input type="text" id="prof-last" class="form-control" value="${escapeHtml(user.last_name)}">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Email</label>
                                <input type="email" class="form-control" value="${escapeHtml(user.email)}" disabled>
                                <div class="form-hint">Email cannot be changed</div>
                            </div>
                            <button type="submit" class="btn btn-primary">Save Changes</button>
                        </form>
                    </div>
                </div>
            </div>
        `);

        $('#profile-form').onsubmit = async (e) => {
            e.preventDefault();
            const data = await apiPut('/auth/me', {
                first_name: $('#prof-first').value.trim(),
                last_name: $('#prof-last').value.trim(),
            });
            if (data.error) { showToast(data.error, 'error'); return; }
            if (data.user) setUser({ ...user, ...data.user });
            showToast('Profile updated!', 'success');
            this.updateNavUser();
        };
    },

    renderSecurity() {
        const user = getUser();
        setHTML('#page-content', `
            <div class="fade-in" style="max-width:600px;">
                <div class="page-header"><h1>Security & MFA</h1></div>

                <div class="card mb-2">
                    <div class="card-header"><h3 style="font-size:1rem;">Change Password</h3></div>
                    <div class="card-body">
                        <form id="pw-form">
                            <div class="form-group">
                                <label>Current Password</label>
                                <input type="password" id="sec-current-pw" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>New Password</label>
                                <input type="password" id="sec-new-pw" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Confirm New Password</label>
                                <input type="password" id="sec-confirm-pw" class="form-control" required>
                            </div>
                            <button type="submit" class="btn btn-primary">Change Password</button>
                        </form>
                    </div>
                </div>

                <div class="card mb-2">
                    <div class="card-header">
                        <h3 style="font-size:1rem;">Two-Factor Authentication (MFA)</h3>
                        <span class="tag tag-${user.mfa_enabled ? 'success' : 'secondary'}">${user.mfa_enabled ? 'Enabled' : 'Disabled'}</span>
                    </div>
                    <div class="card-body">
                        <p class="text-secondary mb-2" style="font-size:0.9rem;">Add an extra layer of security using a TOTP authenticator app like Google Authenticator.</p>
                        ${user.mfa_enabled ?
                            '<button class="btn btn-danger" id="btn-disable-mfa">Disable MFA</button>' :
                            '<button class="btn btn-primary" id="btn-setup-mfa">Setup MFA</button>'}
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h3 style="font-size:1rem;">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#0078D4" stroke-width="2" style="display:inline; vertical-align:middle; margin-right:6px;">
                                <path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path>
                            </svg>
                            OneDrive Integration
                        </h3>
                        <span class="tag" id="onedrive-status-tag">Checking...</span>
                    </div>
                    <div class="card-body" id="onedrive-section">
                        <p class="text-secondary mb-2" style="font-size:0.9rem;">Connect your Microsoft OneDrive to easily share files and course materials.</p>
                        <div id="onedrive-link-form">
                            <div class="form-group">
                                <label>OneDrive / Microsoft Email</label>
                                <input type="email" id="onedrive-email" class="form-control" placeholder="your.name@organization.com">
                                <div class="form-hint">This email will be used to identify your OneDrive shared files</div>
                            </div>
                            <button class="btn btn-primary" id="btn-link-onedrive" style="background:#0078D4;">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="2" style="margin-right:4px;"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
                                Link OneDrive
                            </button>
                        </div>
                        <div id="onedrive-linked-info" class="hidden">
                            <div class="flex items-center gap-2 mb-2" style="padding:12px; background:var(--success-bg); border-radius:var(--radius-sm);">
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--success)" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                <div>
                                    <strong>OneDrive Connected</strong>
                                    <div style="font-size:0.8rem; color:var(--text-secondary);" id="onedrive-linked-email"></div>
                                </div>
                            </div>
                            <button class="btn btn-danger btn-sm" id="btn-unlink-onedrive">Disconnect OneDrive</button>
                        </div>
                    </div>
                </div>
            </div>
        `);

        $('#pw-form').onsubmit = async (e) => {
            e.preventDefault();
            if ($('#sec-new-pw').value !== $('#sec-confirm-pw').value) {
                showToast('Passwords do not match', 'error');
                return;
            }
            const data = await apiPost('/auth/change-password', {
                current_password: $('#sec-current-pw').value,
                new_password: $('#sec-new-pw').value,
            });
            if (data.error) { showToast(data.error, 'error'); return; }
            showToast('Password changed!', 'success');
            $('#pw-form').reset();
        };

        const setupBtn = $('#btn-setup-mfa');
        if (setupBtn) setupBtn.onclick = () => this.setupMFA();

        const disableBtn = $('#btn-disable-mfa');
        if (disableBtn) disableBtn.onclick = () => this.disableMFA();

        // OneDrive integration
        this.loadOneDriveStatus();

        const linkBtn = $('#btn-link-onedrive');
        if (linkBtn) linkBtn.onclick = async () => {
            const email = $('#onedrive-email').value.trim();
            if (!email) { showToast('Please enter your OneDrive email', 'warning'); return; }
            const data = await apiPost('/onedrive/link', { onedrive_email: email });
            if (data.error) { showToast(data.error, 'error'); return; }
            showToast('OneDrive linked successfully!', 'success');
            this.loadOneDriveStatus();
        };

        const unlinkBtn = $('#btn-unlink-onedrive');
        if (unlinkBtn) unlinkBtn.onclick = async () => {
            const data = await apiPost('/onedrive/unlink', {});
            if (data.error) { showToast(data.error, 'error'); return; }
            showToast('OneDrive disconnected', 'info');
            this.loadOneDriveStatus();
        };
    },

    async loadOneDriveStatus() {
        const data = await apiGet('/onedrive/status');
        const tag = $('#onedrive-status-tag');
        const form = $('#onedrive-link-form');
        const info = $('#onedrive-linked-info');

        if (data.linked) {
            if (tag) { tag.textContent = 'Connected'; tag.className = 'tag tag-success'; }
            if (form) form.classList.add('hidden');
            if (info) info.classList.remove('hidden');
            const emailEl = $('#onedrive-linked-email');
            if (emailEl) emailEl.textContent = data.email;
        } else {
            if (tag) { tag.textContent = 'Not Connected'; tag.className = 'tag tag-secondary'; }
            if (form) form.classList.remove('hidden');
            if (info) info.classList.add('hidden');
        }
    },

    async setupMFA() {
        const data = await apiPost('/auth/mfa/setup', {});
        if (data.error) { showToast(data.error, 'error'); return; }

        showModal('Setup MFA', `
            <div class="mfa-setup">
                <p class="mb-2">Scan this QR code with your authenticator app:</p>
                <img src="${data.qr_code}" alt="MFA QR Code" style="width:200px; height:200px;">
                <p class="text-muted mt-1" style="font-size:0.8rem;">Secret: <code>${data.secret}</code></p>
                <div class="form-group mt-2">
                    <label>Enter verification code from your app:</label>
                    <input type="text" id="mfa-verify-code" class="form-control" maxlength="6" placeholder="000000" style="text-align:center; font-size:1.5rem; letter-spacing:8px; max-width:200px; margin:0 auto;">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" id="btn-verify-mfa">Enable MFA</button>
        `);

        setTimeout(() => {
            const btn = $('#btn-verify-mfa');
            if (btn) btn.onclick = async () => {
                const code = $('#mfa-verify-code').value.trim();
                const result = await apiPost('/auth/mfa/enable', { secret: data.secret, code });
                if (result.error) { showToast(result.error, 'error'); return; }
                closeModal();
                const user = getUser();
                user.mfa_enabled = true;
                setUser(user);
                showToast('MFA enabled successfully!', 'success');
                this.renderSecurity();
            };
        }, 0);
    },

    async disableMFA() {
        showModal('Disable MFA', `
            <p class="mb-2">Enter your password to disable MFA:</p>
            <div class="form-group">
                <input type="password" id="mfa-disable-pw" class="form-control" placeholder="Your password">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-danger" id="btn-confirm-disable">Disable</button>
        `);

        setTimeout(() => {
            const btn = $('#btn-confirm-disable');
            if (btn) btn.onclick = async () => {
                const data = await apiPost('/auth/mfa/disable', { password: $('#mfa-disable-pw').value });
                if (data.error) { showToast(data.error, 'error'); return; }
                closeModal();
                const user = getUser();
                user.mfa_enabled = false;
                setUser(user);
                showToast('MFA disabled', 'success');
                this.renderSecurity();
            };
        }, 0);
    },

    renderChangePassword() {
        setHTML('#page-content', `
            <div class="fade-in" style="max-width:500px; margin:40px auto;">
                <div class="card">
                    <div class="card-header"><h3>Set New Password</h3></div>
                    <div class="card-body">
                        <p class="text-secondary mb-2">You must change your password before continuing.</p>
                        <form id="force-pw-form">
                            <div class="form-group">
                                <label>New Password</label>
                                <input type="password" id="force-new-pw" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Confirm Password</label>
                                <input type="password" id="force-confirm-pw" class="form-control" required>
                            </div>
                            <button type="submit" class="btn btn-primary w-full">Set Password</button>
                        </form>
                    </div>
                </div>
            </div>
        `);

        $('#force-pw-form').onsubmit = async (e) => {
            e.preventDefault();
            if ($('#force-new-pw').value !== $('#force-confirm-pw').value) {
                showToast('Passwords do not match', 'error');
                return;
            }
            // Use a temporary old password since we don't know the current one in this flow
            const data = await apiPost('/auth/change-password', {
                current_password: $('#force-new-pw').value, // hacky but works for forced reset
                new_password: $('#force-new-pw').value,
            });
            if (data.error) { showToast(data.error, 'error'); return; }
            const user = getUser();
            user.must_reset_pw = false;
            setUser(user);
            showToast('Password set!', 'success');
            window.location.hash = '#/dashboard';
        };
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => App.init());
