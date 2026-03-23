/* ===== Microsoft Teams Integration Module ===== */
const TeamsModule = {
    generateTeamsLink(action, params = {}) {
        const base = 'https://teams.microsoft.com';
        switch (action) {
            case 'chat':
                return `${base}/l/chat/0/0?users=${encodeURIComponent(params.email)}`;
            case 'call':
                return `${base}/l/call/0/0?users=${encodeURIComponent(params.email)}`;
            case 'meeting':
                return `${base}/l/meetup-join/0/0`;
            case 'channel':
                return `${base}/l/channel/0/0`;
            default:
                return base;
        }
    },

    renderTeamsButton(email, name, type = 'chat') {
        if (!email) return '';
        const link = this.generateTeamsLink(type, { email });
        const icons = {
            chat: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
            call: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
            meeting: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>'
        };
        const labels = { chat: 'Chat', call: 'Call', meeting: 'Meet' };
        return `<a href="${link}" target="_blank" class="btn btn-sm" style="background:#6264A7; color:white; font-size:0.75rem; padding:4px 10px;" title="Open in Microsoft Teams">
            ${icons[type] || ''} ${labels[type] || 'Teams'}
        </a>`;
    },

    renderTeamsActions(email, name) {
        if (!email) return '';
        return `
            <div class="flex gap-1">
                ${this.renderTeamsButton(email, name, 'chat')}
                ${this.renderTeamsButton(email, name, 'call')}
                ${this.renderTeamsButton(email, name, 'meeting')}
            </div>
        `;
    },

    renderTeamsCard(email, name, role) {
        return `
            <div class="flex items-center gap-2" style="padding:8px 12px; background:var(--bg); border-radius:var(--radius-sm);">
                <div class="avatar avatar-sm" style="background:#6264A7;">${getInitials(name.split(' ')[0], name.split(' ').slice(1).join(' '))}</div>
                <div class="flex-1">
                    <strong style="font-size:0.85rem;">${escapeHtml(name)}</strong>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(email)}</div>
                </div>
                ${this.renderTeamsActions(email, name)}
            </div>
        `;
    },

    // Render a Teams integration panel for a course
    async renderForCourse(courseId) {
        const [courseData, studData] = await Promise.all([
            apiGet(`/courses/${courseId}`),
            apiGet(`/courses/${courseId}/students`)
        ]);

        const course = courseData.course;
        const students = studData.students || [];
        const faculty = course?.faculty;

        setHTML('#course-tab-content', `
            <div class="fade-in">
                <div class="card mb-2">
                    <div class="card-header">
                        <h3 style="font-size:1rem;">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#6264A7" stroke-width="2" style="display:inline; vertical-align:middle; margin-right:6px;">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                            Microsoft Teams
                        </h3>
                    </div>
                    <div class="card-body">
                        <p class="text-secondary mb-2" style="font-size:0.9rem;">
                            Connect with course members directly through Microsoft Teams using their institutional email.
                        </p>

                        <div style="background:var(--info-bg); padding:12px 16px; border-radius:var(--radius-sm); font-size:0.85rem; color:var(--info); margin-bottom:16px;">
                            <strong>Quick Access:</strong> Click any Teams button to open a chat, call, or meeting directly in Microsoft Teams.
                            Make sure you're signed into Teams with your @actvet.gov.ae account.
                        </div>

                        ${faculty ? `
                            <h4 style="font-size:0.9rem; margin-bottom:8px;">Instructor</h4>
                            ${this.renderTeamsCard(faculty.email, faculty.first_name + ' ' + faculty.last_name, 'faculty')}
                            <hr style="margin:16px 0; border-color:var(--border);">
                        ` : ''}

                        <h4 style="font-size:0.9rem; margin-bottom:8px;">Students (${students.length})</h4>
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            ${students.length ? students.map(s =>
                                this.renderTeamsCard(s.email, s.first_name + ' ' + s.last_name, 'student')
                            ).join('') : '<p class="text-muted">No students enrolled</p>'}
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header"><h3 style="font-size:1rem;">Schedule a Teams Meeting</h3></div>
                    <div class="card-body">
                        <p class="text-secondary mb-2" style="font-size:0.85rem;">Create a meeting link to share with all course members.</p>
                        <a href="https://teams.microsoft.com/l/meeting/new" target="_blank" class="btn" style="background:#6264A7; color:white;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="white" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                            Create New Meeting
                        </a>
                    </div>
                </div>
            </div>
        `);
    }
};
