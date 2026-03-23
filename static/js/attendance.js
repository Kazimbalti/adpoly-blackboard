/* ===== Attendance Module ===== */
const AttendanceModule = {
    async renderForCourse(courseId) {
        const [sessData, studData] = await Promise.all([
            apiGet(`/attendance/course/${courseId}/sessions`),
            apiGet(`/courses/${courseId}/students`)
        ]);
        if (sessData.error) { showToast(sessData.error, 'error'); return; }

        const sessions = sessData.sessions || [];
        const students = studData.students || [];
        const user = getUser();
        const isFaculty = user.role === 'faculty' || user.role === 'admin';

        setHTML('#course-tab-content', `
            <div class="fade-in">
                ${isFaculty ? `
                    <div class="mb-2 flex gap-1 flex-wrap">
                        <button class="btn btn-primary btn-sm" onclick="AttendanceModule.showCreateSession(${courseId})">+ New Session</button>
                        <button class="btn btn-outline btn-sm" onclick="AttendanceModule.showReport(${courseId})">Attendance Report</button>
                    </div>
                ` : ''}

                ${sessions.length ? `
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Topic</th>
                                    <th>Present</th>
                                    <th>Absent</th>
                                    <th>Late</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${sessions.map(s => `
                                    <tr>
                                        <td><strong>${formatDate(s.session_date)}</strong></td>
                                        <td><span class="tag tag-${s.session_type === 'lecture' ? 'primary' : s.session_type === 'lab' ? 'info' : 'secondary'}">${s.session_type}</span></td>
                                        <td>${escapeHtml(s.topic || '-')}</td>
                                        <td><span class="text-success">${s.present_count || 0}</span></td>
                                        <td><span class="text-danger">${s.absent_count || 0}</span></td>
                                        <td><span class="text-warning">${s.late_count || 0}</span></td>
                                        <td>
                                            ${isFaculty ? `
                                                <button class="btn btn-sm btn-outline" onclick="AttendanceModule.openSession(${s.id}, ${courseId})">Take/Edit</button>
                                                <button class="btn btn-sm btn-ghost text-danger" onclick="AttendanceModule.deleteSession(${s.id}, ${courseId})">Delete</button>
                                            ` : `
                                                <span class="tag tag-${s.my_status === 'present' ? 'success' : s.my_status === 'absent' ? 'danger' : s.my_status === 'late' ? 'warning' : 'secondary'}">${s.my_status || 'N/A'}</span>
                                            `}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : '<div class="empty-state"><h3>No attendance sessions</h3><p>Create a session to start tracking attendance.</p></div>'}
            </div>
        `);
    },

    showCreateSession(courseId) {
        const today = new Date().toISOString().split('T')[0];
        showModal('New Attendance Session', `
            <form>
                <div class="form-row">
                    <div class="form-group">
                        <label>Date</label>
                        <input type="date" id="att-date" class="form-control" value="${today}" required>
                    </div>
                    <div class="form-group">
                        <label>Type</label>
                        <select id="att-type" class="form-control">
                            <option value="lecture">Lecture</option>
                            <option value="lab">Lab</option>
                            <option value="tutorial">Tutorial</option>
                            <option value="exam">Exam</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Topic / Description</label>
                    <input type="text" id="att-topic" class="form-control" placeholder="e.g. Chapter 5 - Arrays">
                </div>
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="AttendanceModule.createSession(${courseId})">Create & Take Attendance</button>
        `);
    },

    async createSession(courseId) {
        const data = await apiPost(`/attendance/course/${courseId}/sessions`, {
            session_date: $('#att-date').value,
            session_type: $('#att-type').value,
            topic: $('#att-topic').value.trim()
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Session created!', 'success');
        this.openSession(data.session.id, courseId);
    },

    async openSession(sessionId, courseId) {
        const data = await apiGet(`/attendance/sessions/${sessionId}`);
        if (data.error) { showToast(data.error, 'error'); return; }

        const session = data.session;
        const records = data.records || [];
        const students = data.students || [];

        // Build lookup of existing records
        const recordMap = {};
        records.forEach(r => { recordMap[r.student_id] = r; });

        setHTML('#course-tab-content', `
            <div class="fade-in">
                <div class="flex justify-between items-center mb-2">
                    <div>
                        <h2 style="font-size:1.15rem;">Attendance - ${formatDate(session.session_date)}</h2>
                        <p class="text-secondary" style="font-size:0.85rem;">
                            <span class="tag tag-primary">${session.session_type}</span>
                            ${session.topic ? ` | ${escapeHtml(session.topic)}` : ''}
                        </p>
                    </div>
                    <div class="flex gap-1">
                        <button class="btn btn-sm btn-success" onclick="AttendanceModule.markAll('present', ${sessionId}, ${courseId})">All Present</button>
                        <button class="btn btn-sm btn-danger" onclick="AttendanceModule.markAll('absent', ${sessionId}, ${courseId})">All Absent</button>
                        <button class="btn btn-sm btn-secondary" onclick="AttendanceModule.renderForCourse(${courseId})">Back</button>
                    </div>
                </div>

                <div class="stats-grid mb-2">
                    <div class="stat-card"><div class="stat-card-value" id="att-present-count">${records.filter(r=>r.status==='present').length}</div><div class="stat-card-label">Present</div></div>
                    <div class="stat-card"><div class="stat-card-value" id="att-absent-count">${records.filter(r=>r.status==='absent').length}</div><div class="stat-card-label">Absent</div></div>
                    <div class="stat-card"><div class="stat-card-value" id="att-late-count">${records.filter(r=>r.status==='late').length}</div><div class="stat-card-label">Late</div></div>
                    <div class="stat-card"><div class="stat-card-value" id="att-excused-count">${records.filter(r=>r.status==='excused').length}</div><div class="stat-card-label">Excused</div></div>
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Student</th>
                                <th>Status</th>
                                <th>Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${students.map((s, i) => {
                                const rec = recordMap[s.id];
                                const status = rec ? rec.status : 'absent';
                                return `
                                <tr id="att-row-${s.id}" data-sid="${s.id}">
                                    <td>${i + 1}</td>
                                    <td>
                                        <div class="flex items-center gap-1">
                                            <div class="avatar avatar-sm">${getInitials(s.first_name, s.last_name)}</div>
                                            <strong>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</strong>
                                        </div>
                                    </td>
                                    <td>
                                        <div class="flex gap-1">
                                            <button class="btn btn-sm att-btn ${status === 'present' ? 'btn-success' : 'btn-ghost'}" onclick="AttendanceModule.markStudent(${sessionId}, ${s.id}, 'present', ${courseId})" data-status="present">Present</button>
                                            <button class="btn btn-sm att-btn ${status === 'absent' ? 'btn-danger' : 'btn-ghost'}" onclick="AttendanceModule.markStudent(${sessionId}, ${s.id}, 'absent', ${courseId})" data-status="absent">Absent</button>
                                            <button class="btn btn-sm att-btn ${status === 'late' ? 'btn-warning' : 'btn-ghost'}" onclick="AttendanceModule.markStudent(${sessionId}, ${s.id}, 'late', ${courseId})" data-status="late">Late</button>
                                            <button class="btn btn-sm att-btn ${status === 'excused' ? 'btn-primary' : 'btn-ghost'}" onclick="AttendanceModule.markStudent(${sessionId}, ${s.id}, 'excused', ${courseId})" data-status="excused">Excused</button>
                                        </div>
                                    </td>
                                    <td><input type="text" class="form-control" style="width:150px; padding:4px 8px; font-size:0.8rem;" placeholder="Note..." value="${escapeHtml(rec?.notes || '')}" onchange="AttendanceModule.updateNote(${sessionId}, ${s.id}, this.value)"></td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="mt-2 text-center">
                    <button class="btn btn-primary" onclick="AttendanceModule.saveAll(${sessionId}, ${courseId})">Save All Changes</button>
                </div>
            </div>
        `);
        this._currentStudents = students;
    },

    async markStudent(sessionId, studentId, status, courseId) {
        // Update UI immediately
        const row = $(`#att-row-${studentId}`);
        if (row) {
            row.querySelectorAll('.att-btn').forEach(b => {
                b.className = `btn btn-sm att-btn ${b.dataset.status === status ?
                    (status === 'present' ? 'btn-success' : status === 'absent' ? 'btn-danger' : status === 'late' ? 'btn-warning' : 'btn-primary')
                    : 'btn-ghost'}`;
            });
        }

        const data = await apiPost(`/attendance/sessions/${sessionId}/record`, {
            student_id: studentId,
            status: status
        });
        if (data.error) showToast(data.error, 'error');
    },

    async markAll(status, sessionId, courseId) {
        const students = this._currentStudents || [];
        const records = students.map(s => ({ student_id: s.id, status }));
        const data = await apiPost(`/attendance/sessions/${sessionId}/bulk`, { records });
        if (data.error) { showToast(data.error, 'error'); return; }
        showToast(`Marked all as ${status}`, 'success');
        this.openSession(sessionId, courseId);
    },

    updateNote(sessionId, studentId, note) {
        apiPost(`/attendance/sessions/${sessionId}/record`, {
            student_id: studentId,
            notes: note
        });
    },

    async saveAll(sessionId, courseId) {
        showToast('Attendance saved!', 'success');
        this.openSession(sessionId, courseId);
    },

    async deleteSession(sessionId, courseId) {
        showConfirm('Delete Session', 'Delete this attendance session and all records?', async () => {
            await apiDelete(`/attendance/sessions/${sessionId}`);
            showToast('Session deleted', 'success');
            this.renderForCourse(courseId);
        });
    },

    async showReport(courseId) {
        const data = await apiGet(`/attendance/course/${courseId}/report`);
        if (data.error) { showToast(data.error, 'error'); return; }

        const report = data.report || [];
        const totalSessions = data.total_sessions || 0;

        showModal('Attendance Report', `
            <div class="mb-2">
                <strong>Total Sessions:</strong> ${totalSessions}
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Present</th>
                            <th>Absent</th>
                            <th>Late</th>
                            <th>Excused</th>
                            <th>Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${report.map(r => `
                            <tr>
                                <td><strong>${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</strong></td>
                                <td class="text-success">${r.present}</td>
                                <td class="text-danger">${r.absent}</td>
                                <td class="text-warning">${r.late}</td>
                                <td>${r.excused}</td>
                                <td>
                                    <div class="flex items-center gap-1">
                                        <div class="progress-bar" style="width:80px;">
                                            <div class="progress-fill ${r.attendance_pct >= 75 ? 'success' : r.attendance_pct >= 50 ? 'warning' : 'danger'}" style="width:${r.attendance_pct}%"></div>
                                        </div>
                                        <span class="${r.attendance_pct < 75 ? 'text-danger' : ''}" style="font-weight:600; font-size:0.85rem;">${r.attendance_pct}%</span>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `, '<button class="btn btn-secondary" onclick="closeModal()">Close</button>', { wide: true });
    }
};
