/* ===== Assignments Module ===== */
const AssignmentsModule = {
    async renderForCourse(courseId) {
        const data = await apiGet(`/assignments/course/${courseId}`);
        if (data.error) { showToast(data.error, 'error'); return; }

        const user = getUser();
        const isFaculty = user.role === 'faculty' || user.role === 'admin';
        const now = new Date();

        setHTML('#course-tab-content', `
            <div class="fade-in">
                ${isFaculty ? `
                    <div class="mb-2">
                        <button class="btn btn-primary btn-sm" onclick="AssignmentsModule.showCreateForm(${courseId})">+ New Assignment</button>
                    </div>
                ` : ''}
                <div id="assignments-list">
                    ${data.assignments.length ? data.assignments.map(a => {
                        const isPast = a.due_date && new Date(a.due_date + 'Z') < now;
                        const deadlineClass = isPast ? 'text-danger' : 'text-secondary';
                        const sub = a.submission;
                        const attemptsUsed = a.attempts_used || 0;
                        const maxAttempts = a.max_attempts || 1;
                        const canRetry = attemptsUsed > 0 && attemptsUsed < maxAttempts && !isPast;

                        return `
                        <div class="card mb-2">
                            <div class="card-body">
                                <div class="flex justify-between items-center flex-wrap gap-1">
                                    <div>
                                        <h3 style="font-size:1.05rem; font-weight:600;">${escapeHtml(a.title)}</h3>
                                        <div class="flex gap-2 mt-1 flex-wrap" style="font-size:0.8rem; color:var(--text-muted);">
                                            <span>${a.points} pts</span>
                                            <span>Type: ${a.assignment_type}</span>
                                            ${maxAttempts > 1 ? `<span class="tag tag-secondary">${maxAttempts} attempts</span>` : ''}
                                        </div>
                                        ${a.due_date ? `<div class="${deadlineClass}" style="font-size:0.8rem; margin-top:4px;">Due: ${formatDateTime(a.due_date)}${isPast ? ' (Closed)' : ''}</div>` : '<div style="font-size:0.8rem; margin-top:4px; color:var(--text-muted);">No deadline</div>'}
                                        ${a.allow_late && a.late_window_hours ? `<div style="font-size:0.75rem; color:var(--text-muted);">Late window: ${a.late_window_hours}h after deadline</div>` : ''}
                                    </div>
                                    <div class="flex gap-1 items-center flex-wrap">
                                        ${!isFaculty && attemptsUsed > 0 ? `<span class="tag tag-secondary">${attemptsUsed}/${maxAttempts} attempts</span>` : ''}
                                        ${!isFaculty && sub ? `
                                            <span class="tag tag-success">Submitted</span>
                                            ${sub.is_late ? '<span class="tag tag-danger">Late</span>' : ''}
                                            ${sub.grade !== null ? `<span class="tag tag-primary">${sub.grade}/${a.points}</span>` : '<span class="tag tag-warning">Awaiting Grade</span>'}
                                            ${canRetry ? `<button class="btn btn-outline btn-sm" onclick="AssignmentsModule.showSubmitForm(${a.id}, '${a.assignment_type}')">Resubmit</button>` : ''}
                                        ` : ''}
                                        ${!isFaculty && !sub && !isPast ? `
                                            <button class="btn btn-primary btn-sm" onclick="AssignmentsModule.showSubmitForm(${a.id}, '${a.assignment_type}')">Submit</button>
                                        ` : ''}
                                        ${!isFaculty && !sub && isPast ? '<span class="tag tag-danger">Missed</span>' : ''}
                                        ${isFaculty ? `
                                            <span class="tag tag-info">${a.submission_count || 0} submitted</span>
                                            ${a.needs_grading > 0 ? `<span class="tag tag-warning">${a.needs_grading} to grade</span>` : '<span class="tag tag-success">All graded</span>'}
                                            <button class="btn btn-outline btn-sm" onclick="AssignmentsModule.viewSubmissions(${a.id})">View</button>
                                            <button class="btn btn-ghost btn-sm" onclick="AssignmentsModule.showEditForm(${a.id}, ${courseId})">Edit</button>
                                        ` : ''}
                                    </div>
                                </div>
                                ${a.description ? `<p class="mt-1" style="font-size:0.9rem; color:var(--text-secondary);">${escapeHtml(a.description)}</p>` : ''}
                                ${a.rubric ? `<details style="margin-top:8px; font-size:0.85rem;"><summary style="cursor:pointer; color:var(--primary);">View Rubric</summary><pre style="margin-top:8px; padding:12px; background:var(--bg); border-radius:var(--radius-sm); white-space:pre-wrap;">${escapeHtml(a.rubric)}</pre></details>` : ''}
                            </div>
                            ${sub && sub.feedback ? `
                                <div class="card-footer">
                                    <strong style="font-size:0.8rem;">Feedback:</strong>
                                    <p style="font-size:0.85rem; color:var(--text-secondary);">${escapeHtml(sub.feedback)}</p>
                                </div>
                            ` : ''}
                        </div>`;
                    }).join('') : '<div class="empty-state"><h3>No assignments</h3></div>'}
                </div>
            </div>
        `);
    },

    showCreateForm(courseId) {
        showModal('Create Assignment', `
            <form>
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" id="asgn-title" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="asgn-desc" class="form-control" rows="3"></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Due Date</label>
                        <input type="datetime-local" id="asgn-due" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Points</label>
                        <input type="number" id="asgn-points" class="form-control" value="100" min="0">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Submission Type</label>
                        <select id="asgn-type" class="form-control">
                            <option value="file">File Upload</option>
                            <option value="text">Text Entry</option>
                            <option value="both">Both</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Max Attempts</label>
                        <select id="asgn-attempts" class="form-control">
                            <option value="1">1 (No resubmission)</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="5">5</option>
                            <option value="99">Unlimited</option>
                        </select>
                    </div>
                </div>
                <div class="form-group" id="asgn-grade-recording-group" style="display:none;">
                    <label>Grade Recording</label>
                    <select id="asgn-grade-recording" class="form-control">
                        <option value="best">Best Attempt</option>
                        <option value="last">Last Attempt</option>
                        <option value="average">Average</option>
                    </select>
                </div>
                <h4 style="margin:12px 0 8px; font-size:0.9rem;">Late Submissions</h4>
                <div class="form-group">
                    <label class="form-check">
                        <input type="checkbox" id="asgn-late" onchange="$('#late-options').style.display=this.checked?'block':'none'"> Allow late submissions
                    </label>
                </div>
                <div id="late-options" style="display:none;">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Late Window (hours after deadline)</label>
                            <input type="number" id="asgn-late-hours" class="form-control" value="48" min="0">
                        </div>
                        <div class="form-group">
                            <label>Penalty % per day late</label>
                            <input type="number" id="asgn-late-penalty" class="form-control" value="0" min="0" max="100" step="1">
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Rubric (optional)</label>
                    <textarea id="asgn-rubric" class="form-control" rows="3" placeholder="Grading criteria visible to students..."></textarea>
                </div>
            </form>
            <script>
                document.getElementById('asgn-attempts').addEventListener('change', function() {
                    document.getElementById('asgn-grade-recording-group').style.display = this.value > 1 ? 'block' : 'none';
                });
            </script>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="AssignmentsModule.create(${courseId})">Create</button>
        `, { wide: true });
    },

    async create(courseId) {
        const data = await apiPost(`/assignments/course/${courseId}`, {
            title: $('#asgn-title').value.trim(),
            description: $('#asgn-desc').value.trim(),
            due_date: $('#asgn-due').value ? new Date($('#asgn-due').value).toISOString().replace('T', ' ').slice(0, 19) : null,
            points: parseFloat($('#asgn-points').value) || 100,
            assignment_type: $('#asgn-type').value,
            max_attempts: parseInt($('#asgn-attempts').value),
            grade_recording: $('#asgn-grade-recording')?.value || 'last',
            allow_late: $('#asgn-late').checked ? 1 : 0,
            late_window_hours: parseInt($('#asgn-late-hours')?.value) || 0,
            late_penalty_per_day: parseFloat($('#asgn-late-penalty')?.value) || 0,
            rubric: $('#asgn-rubric')?.value?.trim() || '',
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Assignment created!', 'success');
        this.renderForCourse(courseId);
    },

    showSubmitForm(assignmentId, type) {
        showModal('Submit Assignment', `
            <form id="submit-form" enctype="multipart/form-data">
                ${type !== 'file' ? `
                    <div class="form-group">
                        <label>Text Submission</label>
                        <textarea id="sub-content" class="form-control" rows="6" placeholder="Enter your answer here..."></textarea>
                    </div>
                ` : ''}
                ${type !== 'text' ? `
                    <div class="form-group">
                        <label>File Upload</label>
                        <input type="file" id="sub-file" class="form-control">
                    </div>
                ` : ''}
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="AssignmentsModule.submit(${assignmentId})">Submit</button>
        `);
    },

    async submit(assignmentId) {
        const fileInput = $('#sub-file');
        const contentInput = $('#sub-content');

        if (fileInput && fileInput.files.length) {
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            if (contentInput) formData.append('content', contentInput.value.trim());
            const data = await apiUpload(`/assignments/${assignmentId}/submit`, formData);
            if (data.error) { showToast(data.error, 'error'); return; }
        } else if (contentInput) {
            const data = await apiPost(`/assignments/${assignmentId}/submit`, {
                content: contentInput.value.trim()
            });
            if (data.error) { showToast(data.error, 'error'); return; }
        } else {
            showToast('Please provide a submission', 'warning');
            return;
        }

        closeModal();
        showToast('Assignment submitted!', 'success');
    },

    async viewSubmissions(assignmentId) {
        const data = await apiGet(`/assignments/${assignmentId}`);
        if (data.error) { showToast(data.error, 'error'); return; }

        const a = data.assignment;
        const subs = a.submissions || [];

        // Group by student, show latest
        const byStudent = {};
        subs.forEach(s => {
            if (!byStudent[s.student_id] || s.attempt_number > byStudent[s.student_id].attempt_number) {
                byStudent[s.student_id] = s;
            }
            if (!byStudent[s.student_id].all_attempts) byStudent[s.student_id].all_attempts = [];
        });
        const latestSubs = Object.values(byStudent);

        showModal(`Submissions - ${a.title}`, `
            <div class="mb-1 flex justify-between items-center" style="font-size:0.85rem; color:var(--text-secondary);">
                <span>${latestSubs.length} student(s) | ${latestSubs.filter(s => s.grade !== null).length} graded</span>
                ${a.max_attempts > 1 ? `<span class="tag tag-info">${a.max_attempts} attempts allowed | Record: ${a.grade_recording || 'last'}</span>` : ''}
            </div>
            ${latestSubs.length ? `
                <div class="table-container">
                    <table>
                        <thead><tr><th>Student</th><th>Attempt</th><th>Submitted</th><th>Grade</th><th>Action</th></tr></thead>
                        <tbody>
                            ${latestSubs.map(s => `
                                <tr>
                                    <td>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</td>
                                    <td>#${s.attempt_number || 1}</td>
                                    <td>${formatDateTime(s.submitted_at)} ${s.is_late ? '<span class="tag tag-danger">Late</span>' : ''}</td>
                                    <td>${s.grade !== null ? `${s.grade}/${a.points}` : '<span class="tag tag-warning">Pending</span>'}</td>
                                    <td>
                                        <button class="btn btn-sm btn-outline" onclick="AssignmentsModule.showGradeForm(${s.id}, ${a.points})">Grade</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : '<div class="empty-state"><p>No submissions yet</p></div>'}
        `, '<button class="btn btn-secondary" onclick="closeModal()">Close</button>', { wide: true });
    },

    showGradeForm(submissionId, maxPoints) {
        showModal('Grade Submission', `
            <form>
                <div class="form-group">
                    <label>Grade (out of ${maxPoints})</label>
                    <input type="number" id="grade-value" class="form-control" min="0" max="${maxPoints}" step="0.5" required>
                </div>
                <div class="form-group">
                    <label>Feedback</label>
                    <textarea id="grade-feedback" class="form-control" rows="3" placeholder="Optional feedback for the student..."></textarea>
                </div>
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="AssignmentsModule.submitGrade(${submissionId})">Save Grade</button>
        `);
    },

    async submitGrade(submissionId) {
        const data = await apiPost(`/assignments/submissions/${submissionId}/grade`, {
            grade: parseFloat($('#grade-value').value),
            feedback: $('#grade-feedback').value.trim(),
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Grade saved!', 'success');
    },

    showEditForm(assignmentId, courseId) {
        apiGet(`/assignments/${assignmentId}`).then(data => {
            if (data.error) { showToast(data.error, 'error'); return; }
            const a = data.assignment;
            showModal('Edit Assignment', `
                <form>
                    <div class="form-group">
                        <label>Title</label>
                        <input type="text" id="edit-asgn-title" class="form-control" value="${escapeHtml(a.title)}">
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <textarea id="edit-asgn-desc" class="form-control" rows="3">${escapeHtml(a.description || '')}</textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Due Date</label>
                            <input type="datetime-local" id="edit-asgn-due" class="form-control" value="${a.due_date ? a.due_date.replace(' ', 'T').slice(0,16) : ''}">
                        </div>
                        <div class="form-group">
                            <label>Points</label>
                            <input type="number" id="edit-asgn-points" class="form-control" value="${a.points}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Max Attempts</label>
                            <select id="edit-asgn-attempts" class="form-control">
                                ${[1,2,3,5,99].map(v => `<option value="${v}" ${(a.max_attempts||1) == v ? 'selected' : ''}>${v === 99 ? 'Unlimited' : v}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Grade Recording</label>
                            <select id="edit-asgn-grade" class="form-control">
                                ${['best','last','average'].map(v => `<option value="${v}" ${(a.grade_recording||'last') == v ? 'selected' : ''}>${v}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-check mt-1">
                                <input type="checkbox" id="edit-asgn-late" ${a.allow_late ? 'checked' : ''}> Allow late
                            </label>
                        </div>
                        <div class="form-group">
                            <label>Late Window (hours)</label>
                            <input type="number" id="edit-asgn-late-hours" class="form-control" value="${a.late_window_hours || 0}">
                        </div>
                        <div class="form-group">
                            <label>Penalty %/day</label>
                            <input type="number" id="edit-asgn-penalty" class="form-control" value="${a.late_penalty_per_day || 0}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-check">
                            <input type="checkbox" id="edit-asgn-visible" ${a.is_visible ? 'checked' : ''}> Visible to students
                        </label>
                    </div>
                </form>
            `, `
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn btn-primary" onclick="AssignmentsModule.update(${assignmentId}, ${courseId})">Save</button>
            `, { wide: true });
        });
    },

    async update(assignmentId, courseId) {
        const dueVal = $('#edit-asgn-due').value;
        const data = await apiPut(`/assignments/${assignmentId}`, {
            title: $('#edit-asgn-title').value.trim(),
            description: $('#edit-asgn-desc').value.trim(),
            due_date: dueVal ? new Date(dueVal).toISOString().replace('T', ' ').slice(0, 19) : null,
            points: parseFloat($('#edit-asgn-points').value) || 100,
            max_attempts: parseInt($('#edit-asgn-attempts').value),
            grade_recording: $('#edit-asgn-grade').value,
            allow_late: $('#edit-asgn-late').checked ? 1 : 0,
            late_window_hours: parseInt($('#edit-asgn-late-hours').value) || 0,
            late_penalty_per_day: parseFloat($('#edit-asgn-penalty').value) || 0,
            is_visible: $('#edit-asgn-visible').checked ? 1 : 0,
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Assignment updated!', 'success');
        this.renderForCourse(courseId);
    }
};
