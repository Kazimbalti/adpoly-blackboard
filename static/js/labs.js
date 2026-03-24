/* ===== Labs Module ===== */
const LabsModule = {
    async renderForCourse(courseId) {
        const data = await apiGet(`/labs/course/${courseId}`);
        if (data.error) { showToast(data.error, 'error'); return; }

        const user = getUser();
        const isFaculty = user.role === 'faculty' || user.role === 'admin';
        const now = new Date();

        setHTML('#course-tab-content', `
            <div class="fade-in">
                ${isFaculty ? `
                    <div class="mb-2">
                        <button class="btn btn-primary btn-sm" onclick="LabsModule.showCreateForm(${courseId})">+ New Lab</button>
                    </div>
                ` : ''}
                ${data.labs.length ? data.labs.map(lab => {
                    const isPast = lab.due_date && new Date(lab.due_date + 'Z') < now;
                    const sub = lab.submission;
                    const attUsed = lab.attempts_used || 0;
                    const maxAtt = lab.max_attempts || 1;
                    const canRetry = attUsed > 0 && attUsed < maxAtt && !isPast;

                    return `
                    <div class="card mb-2">
                        <div class="card-body">
                            <div class="flex justify-between items-center flex-wrap gap-1">
                                <div>
                                    <h3 style="font-size:1.05rem; font-weight:600;">${escapeHtml(lab.title)}</h3>
                                    <div class="flex gap-2 mt-1 flex-wrap" style="font-size:0.8rem; color:var(--text-muted);">
                                        <span>${lab.points} pts</span>
                                        ${lab.lab_date ? `<span>Lab: ${formatDate(lab.lab_date)}</span>` : ''}
                                        ${maxAtt > 1 ? `<span class="tag tag-secondary">${maxAtt} attempts</span>` : ''}
                                    </div>
                                    ${lab.due_date ? `<div style="font-size:0.8rem; color:${isPast ? 'var(--danger)' : 'var(--text-muted)'}; margin-top:4px;">Report Due: ${formatDateTime(lab.due_date)}${isPast ? ' (Closed)' : ''}</div>` : ''}
                                </div>
                                <div class="flex gap-1 items-center flex-wrap">
                                    ${!isFaculty && attUsed > 0 ? `<span class="tag tag-secondary">${attUsed}/${maxAtt}</span>` : ''}
                                    ${!isFaculty && sub ? `
                                        <span class="tag tag-success">Submitted</span>
                                        ${sub.is_late ? '<span class="tag tag-danger">Late</span>' : ''}
                                        ${sub.grade !== null ? `<span class="tag tag-primary">${sub.grade}/${lab.points}</span>` : '<span class="tag tag-warning">Awaiting Grade</span>'}
                                        ${canRetry ? `<button class="btn btn-outline btn-sm" onclick="LabsModule.submitLab(${lab.id}, '${lab.submission_type}')">Resubmit</button>` : ''}
                                    ` : ''}
                                    ${!isFaculty && !sub && !isPast ? `<button class="btn btn-primary btn-sm" onclick="LabsModule.submitLab(${lab.id}, '${lab.submission_type}')">Submit Report</button>` : ''}
                                    ${!isFaculty && !sub && isPast ? '<span class="tag tag-danger">Missed</span>' : ''}
                                    ${isFaculty ? `
                                        <span class="tag tag-info">${lab.submission_count || 0} submitted</span>
                                        <button class="btn btn-outline btn-sm" onclick="LabsModule.viewSubmissions(${lab.id}, '${escapeHtml(lab.title)}', ${lab.points})">Review</button>
                                        <button class="btn btn-ghost btn-sm text-danger" onclick="LabsModule.deleteLab(${lab.id}, ${courseId})">Delete</button>
                                    ` : ''}
                                </div>
                            </div>
                            ${lab.description ? `<p class="mt-1" style="font-size:0.9rem; color:var(--text-secondary);">${escapeHtml(lab.description)}</p>` : ''}
                        </div>
                    </div>`;
                }).join('') : '<div class="empty-state"><h3>No labs</h3><p>Lab sessions with report submissions will appear here.</p></div>'}
            </div>
        `);
    },

    showCreateForm(courseId) {
        showModal('Create Lab Session', `
            <form>
                <div class="form-group"><label>Title</label><input type="text" id="lab-title" class="form-control" required></div>
                <div class="form-group"><label>Description</label><textarea id="lab-desc" class="form-control" rows="2"></textarea></div>
                <div class="form-row">
                    <div class="form-group"><label>Lab Date</label><input type="date" id="lab-date" class="form-control"></div>
                    <div class="form-group"><label>Report Due Date</label><input type="datetime-local" id="lab-due" class="form-control"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>Points</label><input type="number" id="lab-points" class="form-control" value="100"></div>
                    <div class="form-group"><label>Submission Type</label>
                        <select id="lab-type" class="form-control"><option value="file">File</option><option value="text">Text</option><option value="both">Both</option></select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>Max Attempts</label>
                        <select id="lab-attempts" class="form-control">
                            <option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="99">Unlimited</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-check mt-2"><input type="checkbox" id="lab-late"> Allow late submissions</label>
                    </div>
                </div>
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="LabsModule.create(${courseId})">Create Lab</button>
        `, { wide: true });
    },

    async create(courseId) {
        const dueVal = $('#lab-due').value;
        const data = await apiPost(`/labs/course/${courseId}`, {
            title: $('#lab-title').value.trim(),
            description: $('#lab-desc').value.trim(),
            lab_date: $('#lab-date').value || null,
            due_date: dueVal ? new Date(dueVal).toISOString().replace('T', ' ').slice(0, 19) : null,
            points: parseFloat($('#lab-points').value) || 100,
            submission_type: $('#lab-type').value,
            max_attempts: parseInt($('#lab-attempts').value),
            allow_late: $('#lab-late').checked ? 1 : 0,
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Lab created!', 'success');
        this.renderForCourse(courseId);
    },

    submitLab(labId, type) {
        showModal('Submit Lab Report', `
            <form enctype="multipart/form-data">
                ${type !== 'file' ? `<div class="form-group"><label>Text</label><textarea id="lab-content" class="form-control" rows="6"></textarea></div>` : ''}
                ${type !== 'text' ? `<div class="form-group"><label>File</label><input type="file" id="lab-file" class="form-control"></div>` : ''}
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="LabsModule.doSubmit(${labId})">Submit</button>
        `);
    },

    async doSubmit(labId) {
        const fileInput = $('#lab-file');
        const contentInput = $('#lab-content');
        if (fileInput && fileInput.files.length) {
            const fd = new FormData();
            fd.append('file', fileInput.files[0]);
            if (contentInput) fd.append('content', contentInput.value.trim());
            const data = await apiUpload(`/labs/${labId}/submit`, fd);
            if (data.error) { showToast(data.error, 'error'); return; }
        } else if (contentInput) {
            const data = await apiPost(`/labs/${labId}/submit`, { content: contentInput.value.trim() });
            if (data.error) { showToast(data.error, 'error'); return; }
        } else { showToast('Please provide a submission', 'warning'); return; }
        closeModal();
        showToast('Lab report submitted!', 'success');
    },

    async viewSubmissions(labId, title, maxPoints) {
        const data = await apiGet(`/labs/${labId}/submissions`);
        if (data.error) { showToast(data.error, 'error'); return; }
        const subs = data.submissions || [];
        showModal(`${title} - Submissions`, `
            ${subs.length ? `<div class="table-container"><table>
                <thead><tr><th>Student</th><th>Attempt</th><th>Submitted</th><th>Grade</th><th>Action</th></tr></thead>
                <tbody>${subs.map(s => `<tr>
                    <td>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</td>
                    <td>#${s.attempt_number}</td>
                    <td>${formatDateTime(s.submitted_at)} ${s.is_late ? '<span class="tag tag-danger">Late</span>' : ''}</td>
                    <td>${s.grade !== null ? `${s.grade}/${maxPoints}` : '<span class="tag tag-warning">Pending</span>'}</td>
                    <td><button class="btn btn-sm btn-outline" onclick="LabsModule.gradeForm(${s.id}, ${maxPoints})">Grade</button></td>
                </tr>`).join('')}</tbody>
            </table></div>` : '<div class="empty-state"><p>No submissions</p></div>'}
        `, '<button class="btn btn-secondary" onclick="closeModal()">Close</button>', { wide: true });
    },

    gradeForm(subId, maxPoints) {
        showModal('Grade Lab', `
            <div class="form-group"><label>Grade (out of ${maxPoints})</label><input type="number" id="lab-grade" class="form-control" min="0" max="${maxPoints}" step="0.5"></div>
            <div class="form-group"><label>Feedback</label><textarea id="lab-feedback" class="form-control" rows="3"></textarea></div>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="LabsModule.saveGrade(${subId})">Save</button>
        `);
    },

    async saveGrade(subId) {
        const data = await apiPost(`/labs/submissions/${subId}/grade`, {
            grade: parseFloat($('#lab-grade').value),
            feedback: $('#lab-feedback').value.trim()
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Grade saved!', 'success');
    },

    async deleteLab(labId, courseId) {
        showConfirm('Delete Lab', 'Delete this lab session?', async () => {
            await apiDelete(`/labs/${labId}`);
            showToast('Lab deleted', 'success');
            this.renderForCourse(courseId);
        });
    }
};
