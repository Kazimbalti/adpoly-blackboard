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
        const [studData, availData] = await Promise.all([
            apiGet(`/courses/${courseId}/students`),
            apiGet('/admin/users?role=student&per_page=200').catch(() => ({ users: [] }))
        ]);
        const students = studData.students || [];
        const user = getUser();
        const isFaculty = user.role === 'faculty' || user.role === 'admin';

        setHTML('#course-tab-content', `
            <div class="fade-in">
                ${isFaculty ? `
                    <div class="mb-2 flex gap-1 flex-wrap">
                        <button class="btn btn-primary btn-sm" onclick="CoursesModule.showAddStudentForm(${courseId})">+ Add Student</button>
                        <button class="btn btn-outline btn-sm" onclick="CoursesModule.showBulkEnrollForm(${courseId})">Bulk Enroll</button>
                        <span class="tag tag-primary" style="align-self:center;">${students.length} enrolled</span>
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
                        <tbody>
                            ${students.length ? students.map((s, i) => `
                                <tr>
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
                                        <td>${TeamsModule.renderTeamsButton(s.email, s.first_name, 'chat')}</td>
                                        <td>
                                            <div class="flex gap-1">
                                                ${s.status === 'active' ? `<button class="btn btn-sm btn-ghost text-danger" onclick="CoursesModule.removeStudent(${courseId}, ${s.id}, '${escapeHtml(s.first_name)}')">Remove</button>` : ''}
                                                ${s.status === 'dropped' ? `<button class="btn btn-sm btn-ghost text-success" onclick="CoursesModule.reEnroll(${courseId}, ${s.id})">Re-enroll</button>` : ''}
                                            </div>
                                        </td>
                                    ` : ''}
                                </tr>
                            `).join('') : '<tr><td colspan="7" class="text-center text-muted">No students enrolled</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `);
    },

    showAddStudentForm(courseId) {
        showModal('Add Student to Course', `
            <form>
                <div class="form-group">
                    <label>Student Email</label>
                    <input type="email" id="add-student-email" class="form-control" placeholder="student@adpoly.ac.ae" required>
                    <div class="form-hint">Enter the student's registered email address</div>
                </div>
                <div class="form-group">
                    <label>Or create a new student account:</label>
                    <div class="form-row mt-1">
                        <input type="text" id="new-student-first" class="form-control" placeholder="First Name">
                        <input type="text" id="new-student-last" class="form-control" placeholder="Last Name">
                    </div>
                    <input type="email" id="new-student-email" class="form-control mt-1" placeholder="New student email">
                    <div class="form-hint">Leave blank if student already has an account</div>
                </div>
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="CoursesModule.addStudent(${courseId})">Add Student</button>
        `);
    },

    async addStudent(courseId) {
        const existingEmail = $('#add-student-email').value.trim();
        const newFirst = $('#new-student-first').value.trim();
        const newLast = $('#new-student-last').value.trim();
        const newEmail = $('#new-student-email').value.trim();

        let studentId = null;

        // If creating new student
        if (newFirst && newEmail) {
            const regData = await apiPost('/auth/register', {
                email: newEmail,
                password: 'Student@123',
                first_name: newFirst,
                last_name: newLast,
                role: 'student'
            });
            if (regData.error && !regData.error.includes('already')) {
                showToast(regData.error, 'error');
                return;
            }
            studentId = regData.user?.id;
        }

        // Enroll by email lookup (faculty enrolls student by ID)
        if (existingEmail || newEmail) {
            const data = await apiPost(`/courses/${courseId}/enroll`, {
                student_email: existingEmail || newEmail,
                student_id: studentId
            });
            if (data.error) { showToast(data.error, 'error'); return; }
        }

        closeModal();
        showToast('Student added!', 'success');
        this.renderStudentsTab(courseId);
    },

    showBulkEnrollForm(courseId) {
        showModal('Bulk Enroll Students', `
            <form>
                <div class="form-group">
                    <label>Student Emails (one per line)</label>
                    <textarea id="bulk-emails" class="form-control" rows="8" placeholder="student1@adpoly.ac.ae\nstudent2@adpoly.ac.ae\nstudent3@adpoly.ac.ae"></textarea>
                    <div class="form-hint">Enter student emails, one per line. Students must already have accounts.</div>
                </div>
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="CoursesModule.bulkEnroll(${courseId})">Enroll All</button>
        `);
    },

    async bulkEnroll(courseId) {
        const emails = $('#bulk-emails').value.split('\\n').map(e => e.trim()).filter(e => e);
        if (!emails.length) { showToast('Enter at least one email', 'warning'); return; }

        let success = 0, failed = 0;
        for (const email of emails) {
            const data = await apiPost(`/courses/${courseId}/enroll`, { student_email: email });
            if (data.error) failed++;
            else success++;
        }
        closeModal();
        showToast(`Enrolled ${success} students. ${failed ? failed + ' failed.' : ''}`, success > 0 ? 'success' : 'error');
        this.renderStudentsTab(courseId);
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
