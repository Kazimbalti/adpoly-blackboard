/* ===== Dashboard Module ===== */
const DashboardModule = {
    async render() {
        showLoading();
        const data = await apiGet('/dashboard/');
        if (data.error) {
            showToast(data.error, 'error');
            return;
        }

        if (data.role === 'faculty') {
            this.renderFacultyDashboard(data);
        } else {
            this.renderStudentDashboard(data);
        }
    },

    renderFacultyDashboard(data) {
        const user = getUser();
        setHTML('#page-content', `
            <div class="fade-in">
                <div class="dashboard-welcome">
                    <h1>Good ${this.getGreeting()}, ${escapeHtml(user?.first_name || 'Professor')}!</h1>
                    <p>Here's an overview of your courses and recent activity.</p>
                </div>

                <div class="stats-grid">
                    ${renderStatCard(data.stats.total_courses, 'Active Courses', '#4A90D9',
                        '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>')}
                    ${renderStatCard(data.stats.total_students, 'Total Students', '#28A745',
                        '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>')}
                    ${renderStatCard(data.stats.pending_grades, 'Pending Grades', '#FFC107',
                        '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>')}
                </div>

                <div class="dashboard-grid">
                    <div>
                        <div class="dashboard-section">
                            <div class="dashboard-section-header">
                                <h2>Your Courses</h2>
                                <button class="btn btn-primary btn-sm" onclick="window.location.hash='#/courses/create'">+ New Course</button>
                            </div>
                            <div class="course-grid">
                                ${data.courses.length ? data.courses.map(c => renderCourseCard(c)).join('') :
                                    '<div class="empty-state"><p>No courses yet. Create your first course!</p></div>'}
                            </div>
                        </div>
                    </div>

                    <div>
                        <div class="dashboard-section">
                            <div class="dashboard-section-header">
                                <h2>Pending Submissions</h2>
                            </div>
                            <div class="activity-feed">
                                ${data.recent_submissions.length ? data.recent_submissions.map(s => `
                                    <div class="activity-item" style="cursor:pointer" onclick="window.location.hash='#/courses/${s.course_id}/assignments'">
                                        <div class="activity-icon assignment">
                                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                                        </div>
                                        <div class="activity-content">
                                            <h4>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</h4>
                                            <p>${escapeHtml(s.assignment_title)} - ${escapeHtml(s.course_code)}</p>
                                        </div>
                                        <div class="activity-time">${formatTimeAgo(s.submitted_at)}</div>
                                    </div>
                                `).join('') : '<div class="empty-state"><p>No pending submissions</p></div>'}
                            </div>
                        </div>

                        <div class="dashboard-section">
                            <div class="dashboard-section-header">
                                <h2>Quick Actions</h2>
                            </div>
                            <div class="quick-actions">
                                <a href="#/courses/create" class="quick-action-btn">
                                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                                    <span>Create Course</span>
                                </a>
                                <a href="#/messages" class="quick-action-btn">
                                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                    <span>Messages</span>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `);
    },

    renderStudentDashboard(data) {
        const user = getUser();
        setHTML('#page-content', `
            <div class="fade-in">
                <div class="dashboard-welcome">
                    <h1>Good ${this.getGreeting()}, ${escapeHtml(user?.first_name || 'Student')}!</h1>
                    <p>Stay on top of your courses and upcoming deadlines.</p>
                </div>

                <div class="stats-grid">
                    ${renderStatCard(data.stats.enrolled_courses, 'Enrolled Courses', '#4A90D9',
                        '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>')}
                    ${renderStatCard(data.stats.pending_assignments, 'Pending Tasks', '#FFC107',
                        '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>')}
                    ${renderStatCard(data.stats.unread_notifications, 'Notifications', '#DC3545',
                        '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>')}
                </div>

                <div class="dashboard-grid">
                    <div>
                        <div class="dashboard-section">
                            <div class="dashboard-section-header">
                                <h2>My Courses</h2>
                                <a href="#/courses/browse" class="btn btn-outline btn-sm">Browse Courses</a>
                            </div>
                            <div class="course-grid">
                                ${data.courses.length ? data.courses.map(c => renderCourseCard(c)).join('') :
                                    '<div class="empty-state"><p>You haven\'t enrolled in any courses yet.</p><a href="#/courses/browse" class="btn btn-primary">Browse Courses</a></div>'}
                            </div>
                        </div>

                        <div class="dashboard-section">
                            <div class="dashboard-section-header">
                                <h2>Announcements</h2>
                            </div>
                            ${data.announcements.length ? data.announcements.slice(0, 5).map(a => renderAnnouncementCard(a)).join('') :
                                '<div class="empty-state"><p>No announcements</p></div>'}
                        </div>
                    </div>

                    <div>
                        <div class="dashboard-section">
                            <div class="dashboard-section-header">
                                <h2>Upcoming Deadlines</h2>
                            </div>
                            <div class="card">
                                <div class="card-body">
                                    ${data.upcoming_assignments.length ?
                                        data.upcoming_assignments.map(a => renderDeadlineItem(a)).join('') :
                                        '<div class="empty-state"><p>No upcoming deadlines</p></div>'}
                                </div>
                            </div>
                        </div>

                        ${data.upcoming_exams.length ? `
                        <div class="dashboard-section">
                            <div class="dashboard-section-header">
                                <h2>Upcoming Exams</h2>
                            </div>
                            <div class="card">
                                <div class="card-body">
                                    ${data.upcoming_exams.map(e => `
                                        <div class="deadline-item">
                                            <div class="activity-icon exam">
                                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                            </div>
                                            <div class="deadline-info">
                                                <h4>${escapeHtml(e.title)}</h4>
                                                <p>${escapeHtml(e.course_code)} | ${e.duration_minutes} min</p>
                                            </div>
                                            <a href="#/courses/${e.course_id}/exams/${e.id}" class="btn btn-sm btn-outline">Take</a>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                        ` : ''}

                        <div class="dashboard-section">
                            <div class="dashboard-section-header">
                                <h2>Recent Grades</h2>
                            </div>
                            <div class="card">
                                <div class="card-body">
                                    ${data.recent_grades.length ? data.recent_grades.map(g => `
                                        <div class="activity-item">
                                            <div class="activity-icon grade">
                                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                                            </div>
                                            <div class="activity-content">
                                                <h4>${escapeHtml(g.title)}</h4>
                                                <p>${escapeHtml(g.course_code)}</p>
                                            </div>
                                            <strong>${g.points_earned !== null ? g.points_earned : '-'}/${g.points_possible}</strong>
                                        </div>
                                    `).join('') : '<div class="empty-state"><p>No grades yet</p></div>'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `);
    },

    getGreeting() {
        const h = new Date().getHours();
        if (h < 12) return 'morning';
        if (h < 17) return 'afternoon';
        return 'evening';
    }
};
