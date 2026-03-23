/* ===== Assignments Module ===== */
const AssignmentsModule = {
    async renderForCourse(courseId) {
        const data = await apiGet(`/assignments/course/${courseId}`);
        if (data.error) { showToast(data.error, 'error'); return; }

        const user = getUser();
        const isFaculty = user.role === 'faculty' || user.role === 'admin';

        setHTML('#course-tab-content', `
            <div class="fade-in">
                ${isFaculty ? `
                    <div class="mb-2">
                        <button class="btn btn-primary btn-sm" onclick="AssignmentsModule.showCreateForm(${courseId})">+ New Assignment</button>
                    </div>
                ` : ''}
                <div id="assignments-list">
                    ${data.assignments.length ? data.assignments.map(a => {
                        const isPast = a.due_date && new Date(a.due_date + 'Z') < new Date();
                        const sub = a.submission;
                        return `
                        <div class="card mb-2">
                            <div class="card-body">
                                <div class="flex justify-between items-center flex-wrap gap-1">
                                    <div>
                                        <h3 style="font-size:1.05rem; font-weight:600;">${escapeHtml(a.title)}</h3>
                                        <div class="flex gap-2 mt-1" style="font-size:0.8rem; color:var(--text-muted);">
                                            <span>${a.points} points</span>
                                            <span>Due: ${a.due_date ? formatDateTime(a.due_date) : 'No deadline'}</span>
                                            <span>Type: ${a.assignment_type}</span>
                                        </div>
                                    </div>
                                    <div class="flex gap-1 items-center">
                                        ${!isFaculty && sub ? `
                                            <span class="tag tag-success">Submitted</span>
                                            ${sub.grade !== null ? `<span class="tag tag-primary">${sub.grade}/${a.points}</span>` : '<span class="tag tag-warning">Pending grade</span>'}
                                        ` : ''}
                                        ${!isFaculty && !sub && !isPast ? `
                                            <button class="btn btn-primary btn-sm" onclick="AssignmentsModule.showSubmitForm(${a.id}, '${a.assignment_type}')">Submit</button>
                                        ` : ''}
                                        ${!isFaculty && !sub && isPast ? '<span class="tag tag-danger">Overdue</span>' : ''}
                                        ${isFaculty ? `
                                            <span class="tag tag-info">${a.submission_count || 0} submissions</span>
                                            <button class="btn btn-outline btn-sm" onclick="AssignmentsModule.viewSubmissions(${a.id})">View</button>
                                            <button class="btn btn-ghost btn-sm" onclick="AssignmentsModule.showEditForm(${a.id})">Edit</button>
                                        ` : ''}
                                    </div>
                                </div>
                                ${a.description ? `<p class="mt-1" style="font-size:0.9rem; color:var(--text-secondary);">${escapeHtml(a.description)}</p>` : ''}
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
                        <label>&nbsp;</label>
                        <label class="form-check">
                            <input type="checkbox" id="asgn-late"> Allow late submissions
                        </label>
                    </div>
                </div>
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="AssignmentsModule.create(${courseId})">Create</button>
        `);
    },

    async create(courseId) {
        const data = await apiPost(`/assignments/course/${courseId}`, {
            title: $('#asgn-title').value.trim(),
            description: $('#asgn-desc').value.trim(),
            due_date: $('#asgn-due').value ? new Date($('#asgn-due').value).toISOString().replace('T', ' ').slice(0, 19) : null,
            points: parseFloat($('#asgn-points').value) || 100,
            assignment_type: $('#asgn-type').value,
            allow_late: $('#asgn-late').checked ? 1 : 0,
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

        showModal(`Submissions - ${a.title}`, `
            <div class="mb-1" style="font-size:0.85rem; color:var(--text-secondary);">
                ${subs.length} submission(s) | ${subs.filter(s => s.grade !== null).length} graded
            </div>
            ${subs.length ? `
                <div class="table-container">
                    <table>
                        <thead><tr><th>Student</th><th>Submitted</th><th>Grade</th><th>Action</th></tr></thead>
                        <tbody>
                            ${subs.map(s => `
                                <tr>
                                    <td>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</td>
                                    <td>${formatDateTime(s.submitted_at)} ${s.is_late ? '<span class="tag tag-danger">Late</span>' : ''}</td>
                                    <td>${s.grade !== null ? `${s.grade}/${a.points}` : '-'}</td>
                                    <td><button class="btn btn-sm btn-outline" onclick="AssignmentsModule.showGradeForm(${s.id}, ${a.points})">Grade</button></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : '<div class="empty-state"><p>No submissions yet</p></div>'}
        `, '', { wide: true });
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

    showEditForm(assignmentId) {
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
                            <label>Points</label>
                            <input type="number" id="edit-asgn-points" class="form-control" value="${a.points}">
                        </div>
                        <div class="form-group">
                            <label>Visibility</label>
                            <label class="form-check mt-1">
                                <input type="checkbox" id="edit-asgn-visible" ${a.is_visible ? 'checked' : ''}> Visible to students
                            </label>
                        </div>
                    </div>
                </form>
            `, `
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn btn-primary" onclick="AssignmentsModule.update(${assignmentId})">Save</button>
            `);
        });
    },

    async update(assignmentId) {
        const data = await apiPut(`/assignments/${assignmentId}`, {
            title: $('#edit-asgn-title').value.trim(),
            description: $('#edit-asgn-desc').value.trim(),
            points: parseFloat($('#edit-asgn-points').value) || 100,
            is_visible: $('#edit-asgn-visible').checked ? 1 : 0,
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Assignment updated!', 'success');
    }
};
