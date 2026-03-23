/* ===== Courses Module ===== */
const CoursesModule = {
    async renderList() {
        showLoading();
        const data = await apiGet('/courses/');
        if (data.error) { showToast(data.error, 'error'); return; }

        const user = getUser();
        setHTML('#page-content', `
            <div class="fade-in">
                <div class="page-header">
                    <h1>${user.role === 'faculty' ? 'My Courses' : 'Enrolled Courses'}</h1>
                    ${user.role === 'faculty' ?
                        '<button class="btn btn-primary" onclick="CoursesModule.showCreateForm()">+ New Course</button>' :
                        '<a href="#/courses/browse" class="btn btn-outline">Browse Courses</a>'}
                </div>
                <div class="course-grid" id="course-list">
                    ${data.courses.length ? data.courses.map(c => renderCourseCard(c)).join('') :
                        '<div class="empty-state" style="grid-column:1/-1"><h3>No courses yet</h3><p>' +
                        (user.role === 'faculty' ? 'Create your first course to get started.' : 'Browse available courses to enroll.') + '</p></div>'}
                </div>
            </div>
        `);
    },

    async renderBrowse() {
        showLoading();
        const data = await apiGet('/courses/available');
        if (data.error) { showToast(data.error, 'error'); return; }

        setHTML('#page-content', `
            <div class="fade-in">
                <div class="page-header">
                    <div>
                        <div class="breadcrumb"><a href="#/courses">Courses</a> / <span>Browse</span></div>
                        <h1>Available Courses</h1>
                    </div>
                </div>
                <div class="course-grid" id="browse-list">
                    ${data.courses.length ? data.courses.map(c => `
                        <div class="course-card">
                            <div class="course-card-banner" style="background: ${c.color || '#4A90D9'}"></div>
                            <div class="course-card-body">
                                <div class="course-card-code">${escapeHtml(c.code)}</div>
                                <div class="course-card-title">${escapeHtml(c.title)}</div>
                                <div class="course-card-meta">
                                    <span>${escapeHtml(c.faculty_first || '')} ${escapeHtml(c.faculty_last || '')}</span>
                                    <span>${c.enrollment_count || 0}/${c.max_students} enrolled</span>
                                </div>
                                ${c.description ? `<p style="font-size:0.85rem; color:var(--text-secondary); margin-top:8px;">${escapeHtml(c.description).substring(0, 100)}...</p>` : ''}
                            </div>
                            <div class="course-card-footer">
                                <span>${c.semester || ''}</span>
                                <button class="btn btn-primary btn-sm" onclick="CoursesModule.enroll(${c.id})">Enroll</button>
                            </div>
                        </div>
                    `).join('') : '<div class="empty-state" style="grid-column:1/-1"><h3>No courses available</h3></div>'}
                </div>
            </div>
        `);
    },

    async renderDetail(courseId) {
        showLoading();
        const data = await apiGet(`/courses/${courseId}`);
        if (data.error) { showToast(data.error, 'error'); return; }

        const course = data.course;
        const user = getUser();
        const isFaculty = user.role === 'faculty' || user.role === 'admin';

        setHTML('#page-content', `
            <div class="fade-in">
                <div class="breadcrumb"><a href="#/courses">Courses</a> / <span>${escapeHtml(course.code)}</span></div>

                <div class="course-detail-header">
                    <div class="course-banner" style="background: ${course.color || '#4A90D9'}; margin:-24px -24px 20px -24px; border-radius: var(--radius) var(--radius) 0 0;"></div>
                    <div class="flex justify-between items-center flex-wrap gap-2">
                        <div>
                            <div class="course-code">${escapeHtml(course.code)} | ${escapeHtml(course.semester || '')}</div>
                            <h1>${escapeHtml(course.title)}</h1>
                            ${course.faculty ? `<p class="text-secondary mt-1">Instructor: ${escapeHtml(course.faculty.first_name)} ${escapeHtml(course.faculty.last_name)}</p>` : ''}
                        </div>
                        <div class="flex gap-1">
                            ${isFaculty ? `
                                <button class="btn btn-secondary btn-sm" onclick="CoursesModule.showEditForm(${courseId})">Edit</button>
                                <button class="btn btn-outline btn-sm" onclick="window.location.hash='#/courses/${courseId}/students'">Students (${course.enrollment_count})</button>
                            ` : ''}
                        </div>
                    </div>
                    ${course.description ? `<p class="mt-2 text-secondary">${course.description}</p>` : ''}
                </div>

                <div class="tabs" id="course-tabs">
                    <div class="tab active" onclick="CoursesModule.switchTab('announcements', ${courseId})">Announcements</div>
                    <div class="tab" onclick="CoursesModule.switchTab('materials', ${courseId})">Materials</div>
                    <div class="tab" onclick="CoursesModule.switchTab('assignments', ${courseId})">Assignments</div>
                    <div class="tab" onclick="CoursesModule.switchTab('exams', ${courseId})">Exams</div>
                    <div class="tab" onclick="CoursesModule.switchTab('attendance', ${courseId})">Attendance</div>
                    <div class="tab" onclick="CoursesModule.switchTab('students', ${courseId})">Students</div>
                    <div class="tab" onclick="CoursesModule.switchTab('grades', ${courseId})">Grades</div>
                    <div class="tab" onclick="CoursesModule.switchTab('caf', ${courseId})">CAF</div>
                    <div class="tab" onclick="CoursesModule.switchTab('forums', ${courseId})">Forums</div>
                    <div class="tab" onclick="CoursesModule.switchTab('teams', ${courseId})">Teams</div>
                </div>

                <div id="course-tab-content">
                    ${this.renderAnnouncementsTab(course, isFaculty)}
                </div>
            </div>
        `);
    },

    renderAnnouncementsTab(course, isFaculty) {
        return `
            ${isFaculty ? `
                <div class="mb-2">
                    <button class="btn btn-primary btn-sm" onclick="CoursesModule.showAnnouncementForm(${course.id})">+ Post Announcement</button>
                </div>
            ` : ''}
            ${course.announcements?.length ?
                course.announcements.map(a => renderAnnouncementCard(a)).join('') :
                '<div class="empty-state"><h3>No announcements</h3><p>Check back later for updates.</p></div>'}
        `;
    },

    async switchTab(tab, courseId) {
        $$('#course-tabs .tab').forEach(t => t.classList.remove('active'));
        event.target.classList.add('active');

        const content = $('#course-tab-content');
        content.innerHTML = '<div class="loading-page"><div class="loading-spinner"></div></div>';

        switch (tab) {
            case 'announcements':
                const cData = await apiGet(`/courses/${courseId}`);
                content.innerHTML = this.renderAnnouncementsTab(cData.course, getUser().role !== 'student');
                break;
            case 'materials':
                MaterialsModule.renderForCourse(courseId);
                break;
            case 'assignments':
                AssignmentsModule.renderForCourse(courseId);
                break;
            case 'exams':
                ExamsModule.renderForCourse(courseId);
                break;
            case 'attendance':
                AttendanceModule.renderForCourse(courseId);
                break;
            case 'students':
                this.renderStudentsTab(courseId);
                break;
            case 'caf':
                CAFModule.renderForCourse(courseId);
                break;
            case 'forums':
                ForumsModule.renderForCourse(courseId);
                break;
            case 'teams':
                TeamsModule.renderForCourse(courseId);
                break;
            case 'grades':
                GradesModule.renderForCourse(courseId);
                break;
        }
    },

    showCreateForm() {
        const colors = ['#4A90D9', '#7B68EE', '#E74C3C', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C', '#E67E22'];
        showModal('Create New Course', `
            <form id="create-course-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>Course Code</label>
                        <input type="text" id="cc-code" class="form-control" placeholder="e.g. CS101" required>
                    </div>
                    <div class="form-group">
                        <label>Semester</label>
                        <input type="text" id="cc-semester" class="form-control" placeholder="e.g. Spring 2026">
                    </div>
                </div>
                <div class="form-group">
                    <label>Course Title</label>
                    <input type="text" id="cc-title" class="form-control" placeholder="Introduction to Computer Science" required>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="cc-desc" class="form-control" rows="3"></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Max Students</label>
                        <input type="number" id="cc-max" class="form-control" value="50" min="1">
                    </div>
                    <div class="form-group">
                        <label>Color</label>
                        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
                            ${colors.map(c => `<div onclick="this.parentElement.querySelectorAll('div').forEach(d=>d.style.outline='none'); this.style.outline='2px solid var(--text)'; document.getElementById('cc-color').value='${c}'" style="width:32px;height:32px;border-radius:8px;background:${c};cursor:pointer;${c === '#4A90D9' ? 'outline:2px solid var(--text)' : ''}"></div>`).join('')}
                        </div>
                        <input type="hidden" id="cc-color" value="#4A90D9">
                    </div>
                </div>
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="CoursesModule.createCourse()">Create Course</button>
        `);
    },

    async createCourse() {
        const data = await apiPost('/courses/', {
            code: $('#cc-code').value.trim(),
            title: $('#cc-title').value.trim(),
            description: $('#cc-desc').value.trim(),
            semester: $('#cc-semester').value.trim(),
            max_students: parseInt($('#cc-max').value) || 50,
            color: $('#cc-color').value,
        });

        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Course created successfully!', 'success');
        window.location.hash = `#/courses/${data.course.id}`;
    },

    async renderStudentsTab(courseId) {
        const studData = await apiGet(`/courses/${courseId}/students`);
        const students = studData.students || [];
        const user = getUser();
        const isFaculty = user.role === 'faculty' || user.role === 'admin';
        const activeStudents = students.filter(s => s.status === 'active');

        setHTML('#course-tab-content', `
            <div class="fade-in">
                ${isFaculty ? `
                    <div class="card mb-2">
                        <div class="card-body">
                            <div class="flex justify-between items-center flex-wrap gap-2 mb-2">
                                <h3 style="font-size:1.05rem;">Enrolled Students (${activeStudents.length})</h3>
                                <div class="flex gap-1">
                                    <button class="btn btn-primary btn-sm" onclick="CoursesModule.showBulkEnrollForm(${courseId})">+ Bulk Add Students</button>
                                    <button class="btn btn-outline btn-sm" onclick="CoursesModule.showSearchEnroll(${courseId})">Search & Add</button>
                                    <button class="btn btn-secondary btn-sm" onclick="CoursesModule.showVisibilitySettings(${courseId})">Visibility Settings</button>
                                </div>
                            </div>

                            <!-- Quick search enrolled -->
                            <input type="text" class="form-control mb-2" placeholder="Filter enrolled students..." oninput="CoursesModule.filterStudentRows(this.value)" style="max-width:400px;">
                        </div>
                    </div>
                ` : ''}

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Student</th>
                                <th>Email</th>
                                <th>Status</th>
                                <th>Enrolled</th>
                                ${isFaculty ? '<th>Teams</th><th>Actions</th>' : ''}
                            </tr>
                        </thead>
                        <tbody id="student-rows">
                            ${students.length ? students.map((s, i) => `
                                <tr class="student-row" data-name="${escapeHtml((s.first_name+' '+s.last_name+' '+s.email).toLowerCase())}">
                                    <td>${i + 1}</td>
                                    <td>
                                        <div class="flex items-center gap-1">
                                            <div class="avatar avatar-sm">${getInitials(s.first_name, s.last_name)}</div>
                                            <strong>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</strong>
                                        </div>
                                    </td>
                                    <td style="font-size:0.85rem;">${escapeHtml(s.email)}</td>
                                    <td><span class="tag tag-${s.status === 'active' ? 'success' : s.status === 'dropped' ? 'danger' : 'secondary'}">${s.status}</span></td>
                                    <td style="font-size:0.8rem;">${formatDate(s.enrolled_at)}</td>
                                    ${isFaculty ? `
                                        <td>${typeof TeamsModule !== 'undefined' ? TeamsModule.renderTeamsButton(s.email, s.first_name, 'chat') : ''}</td>
                                        <td>
                                            <div class="flex gap-1">
                                                ${s.status === 'active' ? `<button class="btn btn-sm btn-ghost text-danger" onclick="CoursesModule.removeStudent(${courseId}, ${s.id}, '${escapeHtml(s.first_name)}')">Remove</button>` : ''}
                                                ${s.status === 'dropped' ? `<button class="btn btn-sm btn-ghost text-success" onclick="CoursesModule.reEnroll(${courseId}, ${s.id})">Re-enroll</button>` : ''}
                                            </div>
                                        </td>
                                    ` : ''}
                                </tr>
                            `).join('') : '<tr><td colspan="7" class="text-center text-muted">No students enrolled yet. Click "Bulk Add Students" to add them.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `);
    },

    filterStudentRows(query) {
        const q = query.toLowerCase();
        $$('.student-row').forEach(row => {
            row.style.display = !q || row.dataset.name.includes(q) ? '' : 'none';
        });
    },

    showBulkEnrollForm(courseId) {
        showModal('Bulk Add Students', `
            <div style="margin-bottom:16px; padding:12px; background:var(--info-bg); border-radius:var(--radius-sm); font-size:0.85rem; color:var(--info);">
                <strong>How it works:</strong> Paste student emails below (one per line).
                If a student doesn't have an account yet, one will be <strong>automatically created</strong>
                with password <code>Student@123</code>.
            </div>
            <form>
                <div class="form-group">
                    <label>Student Emails (one per line)</label>
                    <textarea id="bulk-emails" class="form-control" rows="12" placeholder="student1@adpoly.ac.ae
student2@adpoly.ac.ae
student3@adpoly.ac.ae
mohammed.ali@adpoly.ac.ae
sara.nasser@adpoly.ac.ae

Paste all student emails here, one per line.
You can also paste comma-separated emails."></textarea>
                    <div class="form-hint">
                        <span id="email-count">0</span> emails detected.
                        New students will be auto-created with password: <strong>Student@123</strong>
                    </div>
                </div>
            </form>
            <script>
                document.getElementById('bulk-emails').addEventListener('input', function() {
                    const count = this.value.split(/[\\n,]/).map(e => e.trim()).filter(e => e && e.includes('@')).length;
                    document.getElementById('email-count').textContent = count;
                });
            </script>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" id="bulk-enroll-btn" onclick="CoursesModule.bulkEnroll(${courseId})">Enroll All Students</button>
        `, { wide: true });
    },

    async bulkEnroll(courseId) {
        const raw = $('#bulk-emails').value;
        const emails = raw.split(/[\n,]/).map(e => e.trim()).filter(e => e && e.includes('@'));

        if (!emails.length) {
            showToast('No valid emails found. Enter emails one per line.', 'warning');
            return;
        }

        const btn = $('#bulk-enroll-btn');
        if (btn) { btn.disabled = true; btn.textContent = `Enrolling ${emails.length} students...`; }

        const data = await apiPost(`/courses/${courseId}/bulk-enroll`, { emails });

        if (data.error) {
            showToast(data.error, 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Enroll All Students'; }
            return;
        }

        const r = data.results;
        closeModal();

        // Show detailed results
        let msg = '';
        if (r.enrolled.length) msg += `${r.enrolled.length} enrolled. `;
        if (r.created_and_enrolled.length) msg += `${r.created_and_enrolled.length} new accounts created & enrolled. `;
        if (r.already_enrolled.length) msg += `${r.already_enrolled.length} already enrolled. `;
        if (r.errors.length) msg += `${r.errors.length} errors.`;

        showToast(msg || data.message, (r.errors.length && !r.enrolled.length) ? 'error' : 'success', 6000);

        // Show errors if any
        if (r.errors.length) {
            setTimeout(() => {
                showModal('Enrollment Errors', `
                    <div class="table-container">
                        <table>
                            <thead><tr><th>Email</th><th>Error</th></tr></thead>
                            <tbody>
                                ${r.errors.map(e => `<tr><td>${escapeHtml(e.email)}</td><td class="text-danger">${escapeHtml(e.reason)}</td></tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                `, '<button class="btn btn-secondary" onclick="closeModal()">Close</button>');
            }, 500);
        }

        this.renderStudentsTab(courseId);
    },

    showSearchEnroll(courseId) {
        showModal('Search & Add Students', `
            <div class="form-group">
                <label>Search by name or email</label>
                <input type="text" id="student-search-input" class="form-control" placeholder="Type to search..." oninput="CoursesModule.searchStudents(${courseId}, this.value)">
            </div>
            <div id="student-search-results" style="max-height:400px; overflow-y:auto;">
                <p class="text-muted text-center" style="padding:20px;">Type at least 2 characters to search</p>
            </div>
        `, '<button class="btn btn-secondary" onclick="closeModal()">Done</button>', { wide: true });
    },

    _searchDebounce: null,
    searchStudents(courseId, query) {
        clearTimeout(this._searchDebounce);
        if (query.length < 2) {
            setHTML('#student-search-results', '<p class="text-muted text-center" style="padding:20px;">Type at least 2 characters to search</p>');
            return;
        }
        this._searchDebounce = setTimeout(async () => {
            const data = await apiGet(`/courses/${courseId}/search-students?q=${encodeURIComponent(query)}`);
            const students = data.students || [];
            setHTML('#student-search-results', students.length ? students.map(s => `
                <div class="flex items-center gap-2 mb-1" style="padding:10px 12px; background:var(--bg); border-radius:var(--radius-sm);">
                    <div class="avatar avatar-sm">${getInitials(s.first_name, s.last_name)}</div>
                    <div class="flex-1">
                        <strong style="font-size:0.9rem;">${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</strong>
                        <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(s.email)}</div>
                    </div>
                    ${s.is_enrolled ? '<span class="tag tag-success">Enrolled</span>' :
                        `<button class="btn btn-sm btn-primary" onclick="CoursesModule.quickEnroll(${courseId}, '${escapeHtml(s.email)}', this)">+ Add</button>`}
                </div>
            `).join('') : '<p class="text-muted text-center" style="padding:20px;">No students found</p>');
        }, 300);
    },

    async quickEnroll(courseId, email, btn) {
        if (btn) { btn.disabled = true; btn.textContent = 'Adding...'; }
        const data = await apiPost(`/courses/${courseId}/enroll`, { student_email: email });
        if (data.error) {
            showToast(data.error, 'error');
            if (btn) { btn.disabled = false; btn.textContent = '+ Add'; }
        } else {
            if (btn) { btn.outerHTML = '<span class="tag tag-success">Enrolled</span>'; }
            showToast('Student added!', 'success');
        }
    },

    showVisibilitySettings(courseId) {
        showModal('Course Visibility Settings', `
            <p class="text-secondary mb-2" style="font-size:0.9rem;">Control what students can see in this course.</p>
            <div class="card mb-2">
                <div class="card-body">
                    <h4 style="font-size:0.95rem; margin-bottom:12px;">Bulk Visibility</h4>
                    <div class="flex flex-col gap-2">
                        <div class="flex justify-between items-center">
                            <span>All Course Materials</span>
                            <div class="flex gap-1">
                                <button class="btn btn-sm btn-success" onclick="CoursesModule.setVisibility(${courseId}, 'materials_visible', true)">Show All</button>
                                <button class="btn btn-sm btn-danger" onclick="CoursesModule.setVisibility(${courseId}, 'materials_visible', false)">Hide All</button>
                            </div>
                        </div>
                        <div class="flex justify-between items-center">
                            <span>All Assignments</span>
                            <div class="flex gap-1">
                                <button class="btn btn-sm btn-success" onclick="CoursesModule.setVisibility(${courseId}, 'assignments_visible', true)">Show All</button>
                                <button class="btn btn-sm btn-danger" onclick="CoursesModule.setVisibility(${courseId}, 'assignments_visible', false)">Hide All</button>
                            </div>
                        </div>
                        <div class="flex justify-between items-center">
                            <span>All Exams</span>
                            <div class="flex gap-1">
                                <button class="btn btn-sm btn-success" onclick="CoursesModule.setVisibility(${courseId}, 'exams_visible', true)">Show All</button>
                                <button class="btn btn-sm btn-danger" onclick="CoursesModule.setVisibility(${courseId}, 'exams_visible', false)">Hide All</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="form-hint">
                You can also show/hide individual items from the Materials, Assignments, and Exams tabs.
            </div>
        `, '<button class="btn btn-secondary" onclick="closeModal()">Done</button>');
    },

    async setVisibility(courseId, field, visible) {
        const data = await apiPut(`/courses/${courseId}/visibility`, { [field]: visible });
        if (data.error) { showToast(data.error, 'error'); return; }
        showToast(`${field.replace('_', ' ')} ${visible ? 'shown' : 'hidden'} for students`, 'success');
    },

    removeStudent(courseId, studentId, name) {
        showConfirm('Remove Student', `Remove ${name} from this course?`, async () => {
            await apiPost(`/courses/${courseId}/unenroll`, { student_id: studentId });
            showToast('Student removed', 'success');
            this.renderStudentsTab(courseId);
        });
    },

    async reEnroll(courseId, studentId) {
        await apiPost(`/courses/${courseId}/enroll`, { student_id: studentId });
        showToast('Student re-enrolled', 'success');
        this.renderStudentsTab(courseId);
    },

    showEditForm(courseId) {
        // Will be populated after loading course data
        showModal('Edit Course', '<div class="loading-page"><div class="loading-spinner"></div></div>');
        apiGet(`/courses/${courseId}`).then(data => {
            if (data.error) { closeModal(); showToast(data.error, 'error'); return; }
            const c = data.course;
            setHTML('#modal-body', `
                <form>
                    <div class="form-group">
                        <label>Title</label>
                        <input type="text" id="ec-title" class="form-control" value="${escapeHtml(c.title)}">
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <textarea id="ec-desc" class="form-control">${escapeHtml(c.description || '')}</textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Semester</label>
                            <input type="text" id="ec-semester" class="form-control" value="${escapeHtml(c.semester || '')}">
                        </div>
                        <div class="form-group">
                            <label>Max Students</label>
                            <input type="number" id="ec-max" class="form-control" value="${c.max_students}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-check">
                            <input type="checkbox" id="ec-published" ${c.is_published ? 'checked' : ''}>
                            Published (visible to students)
                        </label>
                    </div>
                </form>
            `);
            setHTML('#modal-footer', `
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn btn-primary" onclick="CoursesModule.updateCourse(${courseId})">Save Changes</button>
            `);
        });
    },

    async updateCourse(courseId) {
        const data = await apiPut(`/courses/${courseId}`, {
            title: $('#ec-title').value.trim(),
            description: $('#ec-desc').value.trim(),
            semester: $('#ec-semester').value.trim(),
            max_students: parseInt($('#ec-max').value) || 50,
            is_published: $('#ec-published').checked ? 1 : 0,
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Course updated!', 'success');
        this.renderDetail(courseId);
    },

    async enroll(courseId) {
        const data = await apiPost(`/courses/${courseId}/enroll`, {});
        if (data.error) { showToast(data.error, 'error'); return; }
        showToast('Enrolled successfully!', 'success');
        window.location.hash = `#/courses/${courseId}`;
    },

    async renderStudents(courseId) {
        showLoading();
        const data = await apiGet(`/courses/${courseId}/students`);
        if (data.error) { showToast(data.error, 'error'); return; }

        const courseData = await apiGet(`/courses/${courseId}`);
        const course = courseData.course;

        setHTML('#page-content', `
            <div class="fade-in">
                <div class="breadcrumb"><a href="#/courses">Courses</a> / <a href="#/courses/${courseId}">${escapeHtml(course?.code || '')}</a> / <span>Students</span></div>
                <div class="page-header">
                    <h1>Students - ${escapeHtml(course?.title || '')}</h1>
                    <span class="tag tag-primary">${data.students.length} enrolled</span>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Status</th>
                                <th>Enrolled</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.students.map(s => `
                                <tr>
                                    <td><div class="flex items-center gap-1">
                                        <div class="avatar avatar-sm">${getInitials(s.first_name, s.last_name)}</div>
                                        ${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}
                                    </div></td>
                                    <td>${escapeHtml(s.email)}</td>
                                    <td><span class="tag tag-${s.status === 'active' ? 'success' : 'secondary'}">${s.status}</span></td>
                                    <td>${formatDate(s.enrolled_at)}</td>
                                    <td>
                                        <button class="btn btn-ghost btn-sm" onclick="CoursesModule.unenroll(${courseId}, ${s.id})">Remove</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `);
    },

    async unenroll(courseId, studentId) {
        showConfirm('Remove Student', 'Are you sure you want to remove this student?', async () => {
            const data = await apiPost(`/courses/${courseId}/unenroll`, { student_id: studentId });
            if (data.error) { showToast(data.error, 'error'); return; }
            showToast('Student removed', 'success');
            this.renderStudents(courseId);
        });
    },

    showAnnouncementForm(courseId) {
        showModal('Post Announcement', `
            <form>
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" id="ann-title" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Body</label>
                    <textarea id="ann-body" class="form-control" rows="4" required></textarea>
                </div>
                <label class="form-check">
                    <input type="checkbox" id="ann-pinned"> Pin this announcement
                </label>
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="CoursesModule.postAnnouncement(${courseId})">Post</button>
        `);
    },

    async postAnnouncement(courseId) {
        const data = await apiPost(`/courses/${courseId}/announcements`, {
            title: $('#ann-title').value.trim(),
            body: $('#ann-body').value.trim(),
            is_pinned: $('#ann-pinned').checked ? 1 : 0,
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Announcement posted!', 'success');
        this.renderDetail(courseId);
    }
};
