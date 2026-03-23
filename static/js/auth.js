/* ===== Authentication Module ===== */
const AuthModule = {
    renderLogin() {
        setHTML('#auth-container', `
            <div class="auth-partner-logos">
                <img src="/static/images/actvet-logo.png" alt="ACTVET">
                <img src="/static/images/adpoly-badge.png" alt="AD Poly">
            </div>
            <div class="auth-card fade-in">
                <div class="auth-header">
                    <div class="auth-logo">
                        <img src="/static/images/adpoly-logo.png" alt="Abu Dhabi Polytechnic" style="height:60px; width:auto; margin:0 auto;">
                    </div>
                    <h1>ADPOLY Blackboard</h1>
                    <p>Learning Management System</p>
                </div>
                <div class="auth-body">
                    <div id="login-error" class="form-error" style="display:none; margin-bottom:16px; text-align:center;"></div>
                    <form id="login-form">
                        <div class="form-group">
                            <label for="login-email">Email Address</label>
                            <input type="email" id="login-email" class="form-control" placeholder="your.email@adpoly.ac.ae" required>
                        </div>
                        <div class="form-group">
                            <label for="login-password">Password</label>
                            <input type="password" id="login-password" class="form-control" placeholder="Enter your password" required>
                        </div>
                        <div id="mfa-section" style="display:none">
                            <div class="form-group">
                                <label for="login-mfa">MFA Code</label>
                                <input type="text" id="login-mfa" class="form-control" placeholder="Enter 6-digit code" maxlength="6" autocomplete="one-time-code">
                            </div>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                            <label class="form-check">
                                <input type="checkbox" id="remember-me"> Remember me
                            </label>
                            <a href="#/forgot-password" style="font-size:0.85rem;">Forgot password?</a>
                        </div>
                        <button type="submit" class="btn btn-primary btn-lg" id="login-btn">Sign In</button>
                    </form>
                </div>
                <div class="auth-footer">
                    Don't have an account? <a href="#/register">Create one</a>
                </div>
            </div>
            <div class="auth-footer-brand">
                Abu Dhabi Polytechnic | Applied Technology High School<br>
                &copy; ${new Date().getFullYear()} ACTVET. All rights reserved. |
                <a href="https://adpoly.ac.ae" target="_blank" style="color:rgba(255,255,255,0.6);">adpoly.ac.ae</a>
            </div>
        `);

        $('#login-form').onsubmit = async (e) => {
            e.preventDefault();
            const btn = $('#login-btn');
            btn.disabled = true;
            btn.textContent = 'Signing in...';

            const email = $('#login-email').value.trim();
            const password = $('#login-password').value;
            const mfa_code = $('#login-mfa')?.value?.trim();

            const data = await apiPost('/auth/login', { email, password, mfa_code: mfa_code || undefined });

            if (data.mfa_required) {
                show('#mfa-section');
                $('#login-mfa').focus();
                btn.disabled = false;
                btn.textContent = 'Sign In';
                return;
            }

            if (data.error) {
                const errEl = $('#login-error');
                errEl.textContent = data.error;
                errEl.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Sign In';
                return;
            }

            setTokens(data.access_token, data.refresh_token);
            setUser(data.user);
            showToast('Welcome back, ' + data.user.first_name + '!', 'success');

            if (data.user.must_reset_pw) {
                window.location.hash = '#/change-password';
            } else {
                window.location.hash = '#/dashboard';
            }
        };
    },

    renderRegister() {
        let selectedRole = 'student';

        setHTML('#auth-container', `
            <div class="auth-card fade-in">
                <div class="auth-header">
                    <div class="auth-logo">
                        <img src="/static/images/adpoly-logo.png" alt="Abu Dhabi Polytechnic" style="height:60px; width:auto; margin:0 auto;">
                    </div>
                    <h1>Create Account</h1>
                    <p>Join ADPOLY Blackboard</p>
                </div>
                <div class="auth-body">
                    <div id="register-error" class="form-error" style="display:none; margin-bottom:16px; text-align:center;"></div>
                    <form id="register-form">
                        <div class="role-selector">
                            <div class="role-option selected" data-role="student" onclick="AuthModule.selectRole(this, 'student')">
                                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                </svg>
                                <span>Student</span>
                            </div>
                            <div class="role-option" data-role="faculty" onclick="AuthModule.selectRole(this, 'faculty')">
                                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="9" cy="7" r="4"></circle>
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                                </svg>
                                <span>Faculty</span>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="reg-first">First Name</label>
                                <input type="text" id="reg-first" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label for="reg-last">Last Name</label>
                                <input type="text" id="reg-last" class="form-control" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="reg-email">Institutional Email</label>
                            <input type="email" id="reg-email" class="form-control" placeholder="name@adpoly.ac.ae" required>
                        </div>
                        <div class="form-group">
                            <label for="reg-password">Password</label>
                            <input type="password" id="reg-password" class="form-control" placeholder="Min 8 chars, upper, lower, number, special" required oninput="AuthModule.checkPasswordStrength(this.value)">
                            <div class="password-strength" id="pw-strength">
                                <div class="password-strength-bar" id="pw-bar-1"></div>
                                <div class="password-strength-bar" id="pw-bar-2"></div>
                                <div class="password-strength-bar" id="pw-bar-3"></div>
                                <div class="password-strength-bar" id="pw-bar-4"></div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="reg-confirm">Confirm Password</label>
                            <input type="password" id="reg-confirm" class="form-control" required>
                        </div>
                        <button type="submit" class="btn btn-primary btn-lg" id="register-btn">Create Account</button>
                    </form>
                </div>
                <div class="auth-footer">
                    Already have an account? <a href="#/login">Sign in</a>
                </div>
            </div>
        `);

        this._selectedRole = 'student';

        $('#register-form').onsubmit = async (e) => {
            e.preventDefault();
            const password = $('#reg-password').value;
            const confirm = $('#reg-confirm').value;

            if (password !== confirm) {
                $('#register-error').textContent = 'Passwords do not match';
                $('#register-error').style.display = 'block';
                return;
            }

            const btn = $('#register-btn');
            btn.disabled = true;
            btn.textContent = 'Creating account...';

            const data = await apiPost('/auth/register', {
                email: $('#reg-email').value.trim(),
                password: password,
                first_name: $('#reg-first').value.trim(),
                last_name: $('#reg-last').value.trim(),
                role: AuthModule._selectedRole,
            });

            if (data.error) {
                $('#register-error').textContent = data.error;
                $('#register-error').style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Create Account';
                return;
            }

            setTokens(data.access_token, data.refresh_token);
            setUser(data.user);
            showToast('Account created successfully!', 'success');
            window.location.hash = '#/dashboard';
        };
    },

    selectRole(elem, role) {
        $$('.role-option').forEach(el => el.classList.remove('selected'));
        elem.classList.add('selected');
        this._selectedRole = role;
    },

    checkPasswordStrength(password) {
        let score = 0;
        if (password.length >= 8) score++;
        if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;

        const classes = ['', 'weak', 'fair', 'good', 'strong'];
        for (let i = 1; i <= 4; i++) {
            const bar = $(`#pw-bar-${i}`);
            bar.className = 'password-strength-bar';
            if (i <= score) bar.classList.add(classes[score]);
        }
    },

    renderForgotPassword() {
        setHTML('#auth-container', `
            <div class="auth-card fade-in">
                <div class="auth-header">
                    <h1>Reset Password</h1>
                    <p>Enter your email to receive a reset link</p>
                </div>
                <div class="auth-body">
                    <div id="reset-msg" style="display:none; margin-bottom:16px; text-align:center;"></div>
                    <form id="reset-form">
                        <div class="form-group">
                            <label for="reset-email">Email Address</label>
                            <input type="email" id="reset-email" class="form-control" required>
                        </div>
                        <button type="submit" class="btn btn-primary btn-lg">Send Reset Link</button>
                    </form>
                </div>
                <div class="auth-footer">
                    <a href="#/login">Back to Sign In</a>
                </div>
            </div>
        `);

        $('#reset-form').onsubmit = async (e) => {
            e.preventDefault();
            const data = await apiPost('/auth/password-reset/request', {
                email: $('#reset-email').value.trim()
            });
            const msg = $('#reset-msg');
            msg.style.display = 'block';
            if (data.reset_token) {
                msg.className = 'form-hint';
                msg.innerHTML = `Reset token (demo): <code style="word-break:break-all">${data.reset_token}</code>`;
            } else {
                msg.className = 'form-hint';
                msg.textContent = data.message || 'Check your email for reset instructions.';
            }
        };
    }
};
