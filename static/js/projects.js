/* ===== Projects Module ===== */
const ProjectsModule = {
    async renderForCourse(courseId) {
        const data = await apiGet(`/projects/course/${courseId}`);
        if (data.error) { showToast(data.error, 'error'); return; }

        const user = getUser();
        const isFaculty = user.role === 'faculty' || user.role === 'admin';
        const now = new Date();

        setHTML('#course-tab-content', `
            <div class="fade-in">
                ${isFaculty ? `
                    <div class="mb-2">
                        <button class="btn btn-primary btn-sm" onclick="ProjectsModule.showCreateForm(${courseId})">+ New Project</button>
                    </div>
                ` : ''}
                ${data.projects.length ? data.projects.map(p => `
                    <div class="card mb-2">
                        <div class="card-body">
                            <div class="flex justify-between items-center flex-wrap gap-1">
                                <div>
                                    <h3 style="font-size:1.05rem; font-weight:600;">${escapeHtml(p.title)}</h3>
                                    <div style="font-size:0.8rem; color:var(--text-muted);">${p.total_points} total points | ${p.phases.length} phase(s)</div>
                                </div>
                                ${isFaculty ? `
                                    <div class="flex gap-1">
                                        <button class="btn btn-sm btn-outline" onclick="ProjectsModule.addPhaseForm(${p.id})">+ Phase</button>
                                        <button class="btn btn-sm btn-ghost text-danger" onclick="ProjectsModule.deleteProject(${p.id}, ${courseId})">Delete</button>
                                    </div>
                                ` : ''}
                            </div>
                            ${p.description ? `<p class="mt-1" style="font-size:0.9rem; color:var(--text-secondary);">${escapeHtml(p.description)}</p>` : ''}

                            <!-- Phase timeline -->
                            <div style="margin-top:16px;">
                                ${p.phases.map(phase => {
                                    const isPast = phase.due_date && new Date(phase.due_date + 'Z') < now;
                                    const sub = phase.submission;
                                    const attUsed = phase.attempts_used || 0;
                                    const maxAtt = phase.max_attempts || 1;
                                    return `
                                    <div style="padding:12px; margin-bottom:8px; background:var(--bg); border-radius:var(--radius-sm); border-left:3px solid ${isPast ? 'var(--danger)' : sub ? 'var(--success)' : 'var(--border)'};">
                                        <div class="flex justify-between items-center flex-wrap gap-1">
                                            <div>
                                                <strong style="font-size:0.9rem;">${escapeHtml(phase.phase_name)}</strong>
                                                <span class="tag tag-secondary" style="margin-left:8px;">${phase.points || 0} pts (${phase.weight || 0}%)</span>
                                                ${phase.due_date ? `<div style="font-size:0.8rem; color:${isPast ? 'var(--danger)' : 'var(--text-muted)'};">Due: ${formatDateTime(phase.due_date)}${isPast ? ' (Closed)' : ''}</div>` : ''}
                                            </div>
                                            <div class="flex gap-1 items-center">
                                                ${!isFaculty && sub ? `
                                                    <span class="tag tag-success">Submitted</span>
                                                    ${sub.is_late ? '<span class="tag tag-danger">Late</span>' : ''}
                                                    ${sub.grade !== null ? `<span class="tag tag-primary">${sub.grade}/${phase.points}</span>` : '<span class="tag tag-warning">Awaiting Grade</span>'}
                                                    ${attUsed < maxAtt && !isPast ? `<button class="btn btn-outline btn-sm" onclick="ProjectsModule.submitPhase(${phase.id}, '${phase.submission_type}')">Resubmit</button>` : ''}
                                                ` : ''}
                                                ${!isFaculty && !sub && !isPast ? `
                                                    <button class="btn btn-primary btn-sm" onclick="ProjectsModule.submitPhase(${phase.id}, '${phase.submission_type}')">Submit</button>
                                                ` : ''}
                                                ${!isFaculty && !sub && isPast ? '<span class="tag tag-danger">Missed</span>' : ''}
                                                ${isFaculty ? `
                                                    <span class="tag tag-info">${phase.submission_count || 0} submitted</span>
                                                    <button class="btn btn-sm btn-outline" onclick="ProjectsModule.viewPhaseSubmissions(${phase.id}, '${escapeHtml(phase.phase_name)}', ${phase.points || 0})">Review</button>
                                                ` : ''}
                                            </div>
                                        </div>
                                        ${phase.description ? `<p style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">${escapeHtml(phase.description)}</p>` : ''}
                                    </div>`;
                                }).join('')}
                                ${!p.phases.length ? '<p class="text-muted text-center" style="padding:20px;">No phases added yet</p>' : ''}
                            </div>
                        </div>
                    </div>
                `).join('') : '<div class="empty-state"><h3>No projects</h3><p>Projects with multiple phases will appear here.</p></div>'}
            </div>
        `);
    },

    showCreateForm(courseId) {
        showModal('Create Project', `
            <form>
                <div class="form-group">
                    <label>Project Title</label>
                    <input type="text" id="proj-title" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="proj-desc" class="form-control" rows="2"></textarea>
                </div>
                <div class="form-group">
                    <label>Total Points</label>
                    <input type="number" id="proj-points" class="form-control" value="100">
                </div>
                <hr>
                <h4 style="margin:12px 0 8px; font-size:0.9rem;">Phases (add at least one)</h4>
                <div id="phase-list">
                    ${this._phaseRow(1)}
                </div>
                <button type="button" class="btn btn-outline btn-sm mt-1" onclick="ProjectsModule.addPhaseRow()">+ Add Phase</button>
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="ProjectsModule.create(${courseId})">Create Project</button>
        `, { wide: true });
    },

    _phaseRow(num) {
        return `
            <div class="phase-row" style="padding:12px; background:var(--bg); border-radius:var(--radius-sm); margin-bottom:8px;">
                <div class="form-row">
                    <div class="form-group">
                        <label>Phase Name</label>
                        <input type="text" class="form-control phase-name" value="Phase ${num}">
                    </div>
                    <div class="form-group">
                        <label>Due Date</label>
                        <input type="datetime-local" class="form-control phase-due">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Points</label>
                        <input type="number" class="form-control phase-points" value="0">
                    </div>
                    <div class="form-group">
                        <label>Weight %</label>
                        <input type="number" class="form-control phase-weight" value="0">
                    </div>
                    <div class="form-group">
                        <label>Type</label>
                        <select class="form-control phase-type">
                            <option value="file">File</option>
                            <option value="text">Text</option>
                            <option value="both">Both</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    },

    addPhaseRow() {
        const list = $('#phase-list');
        if (!list) return;
        const count = list.querySelectorAll('.phase-row').length + 1;
        list.insertAdjacentHTML('beforeend', this._phaseRow(count));
    },

    async create(courseId) {
        const phases = [];
        $$('.phase-row').forEach(row => {
            const dueVal = row.querySelector('.phase-due').value;
            phases.push({
                phase_name: row.querySelector('.phase-name').value.trim(),
                due_date: dueVal ? new Date(dueVal).toISOString().replace('T', ' ').slice(0, 19) : null,
                points: parseFloat(row.querySelector('.phase-points').value) || 0,
                weight: parseFloat(row.querySelector('.phase-weight').value) || 0,
                submission_type: row.querySelector('.phase-type').value,
            });
        });

        const data = await apiPost(`/projects/course/${courseId}`, {
            title: $('#proj-title').value.trim(),
            description: $('#proj-desc').value.trim(),
            total_points: parseFloat($('#proj-points').value) || 100,
            phases
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Project created!', 'success');
        this.renderForCourse(courseId);
    },

    addPhaseForm(projectId) {
        showModal('Add Phase', `
            <form>
                <div class="form-group">
                    <label>Phase Name</label>
                    <input type="text" id="new-phase-name" class="form-control" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Due Date</label>
                        <input type="datetime-local" id="new-phase-due" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Points</label>
                        <input type="number" id="new-phase-points" class="form-control" value="0">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Weight %</label>
                        <input type="number" id="new-phase-weight" class="form-control" value="0">
                    </div>
                    <div class="form-group">
                        <label>Type</label>
                        <select id="new-phase-type" class="form-control">
                            <option value="file">File</option><option value="text">Text</option><option value="both">Both</option>
                        </select>
                    </div>
                </div>
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="ProjectsModule.addPhase(${projectId})">Add Phase</button>
        `);
    },

    async addPhase(projectId) {
        const dueVal = $('#new-phase-due').value;
        const data = await apiPost(`/projects/${projectId}/phases`, {
            phase_name: $('#new-phase-name').value.trim(),
            due_date: dueVal ? new Date(dueVal).toISOString().replace('T', ' ').slice(0, 19) : null,
            points: parseFloat($('#new-phase-points').value) || 0,
            weight: parseFloat($('#new-phase-weight').value) || 0,
            submission_type: $('#new-phase-type').value,
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Phase added!', 'success');
    },

    submitPhase(phaseId, type) {
        showModal('Submit Phase', `
            <form enctype="multipart/form-data">
                ${type !== 'file' ? `<div class="form-group"><label>Text</label><textarea id="phase-content" class="form-control" rows="6"></textarea></div>` : ''}
                ${type !== 'text' ? `<div class="form-group"><label>File</label><input type="file" id="phase-file" class="form-control"></div>` : ''}
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="ProjectsModule.doSubmitPhase(${phaseId})">Submit</button>
        `);
    },

    async doSubmitPhase(phaseId) {
        const fileInput = $('#phase-file');
        const contentInput = $('#phase-content');

        if (fileInput && fileInput.files.length) {
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            if (contentInput) formData.append('content', contentInput.value.trim());
            const data = await apiUpload(`/projects/phases/${phaseId}/submit`, formData);
            if (data.error) { showToast(data.error, 'error'); return; }
        } else if (contentInput) {
            const data = await apiPost(`/projects/phases/${phaseId}/submit`, { content: contentInput.value.trim() });
            if (data.error) { showToast(data.error, 'error'); return; }
        } else {
            showToast('Please provide a submission', 'warning'); return;
        }
        closeModal();
        showToast('Phase submitted!', 'success');
    },

    async viewPhaseSubmissions(phaseId, phaseName, maxPoints) {
        const data = await apiGet(`/projects/phases/${phaseId}/submissions`);
        if (data.error) { showToast(data.error, 'error'); return; }
        const subs = data.submissions || [];

        showModal(`${phaseName} - Submissions`, `
            ${subs.length ? `
                <div class="table-container"><table>
                    <thead><tr><th>Student</th><th>Attempt</th><th>Submitted</th><th>Grade</th><th>Action</th></tr></thead>
                    <tbody>
                        ${subs.map(s => `<tr>
                            <td>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</td>
                            <td>#${s.attempt_number}</td>
                            <td>${formatDateTime(s.submitted_at)} ${s.is_late ? '<span class="tag tag-danger">Late</span>' : ''}</td>
                            <td>${s.grade !== null ? `${s.grade}/${maxPoints}` : '<span class="tag tag-warning">Pending</span>'}</td>
                            <td><button class="btn btn-sm btn-outline" onclick="ProjectsModule.gradeSubmission(${s.id}, ${maxPoints})">Grade</button></td>
                        </tr>`).join('')}
                    </tbody>
                </table></div>
            ` : '<div class="empty-state"><p>No submissions</p></div>'}
        `, '<button class="btn btn-secondary" onclick="closeModal()">Close</button>', { wide: true });
    },

    gradeSubmission(submissionId, maxPoints) {
        showModal('Grade Phase', `
            <div class="form-group"><label>Grade (out of ${maxPoints})</label><input type="number" id="phase-grade" class="form-control" min="0" max="${maxPoints}" step="0.5"></div>
            <div class="form-group"><label>Feedback</label><textarea id="phase-feedback" class="form-control" rows="3"></textarea></div>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="ProjectsModule.saveGrade(${submissionId})">Save</button>
        `);
    },

    async saveGrade(submissionId) {
        const data = await apiPost(`/projects/submissions/${submissionId}/grade`, {
            grade: parseFloat($('#phase-grade').value),
            feedback: $('#phase-feedback').value.trim()
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Grade saved!', 'success');
    },

    async deleteProject(projectId, courseId) {
        showConfirm('Delete Project', 'Delete this project and all phases?', async () => {
            await apiDelete(`/projects/${projectId}`);
            showToast('Project deleted', 'success');
            this.renderForCourse(courseId);
        });
    }
};
