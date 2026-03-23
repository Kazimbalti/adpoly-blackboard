/* ===== Grades Module ===== */
const GradesModule = {
    async renderForCourse(courseId) {
        const data = await apiGet(`/grades/course/${courseId}`);
        if (data.error) { showToast(data.error, 'error'); return; }

        const user = getUser();
        const isFaculty = user.role === 'faculty' || user.role === 'admin';

        if (isFaculty) {
            this.renderFacultyGradebook(courseId, data);
        } else {
            this.renderStudentGrades(courseId, data);
        }
    },

    renderStudentGrades(courseId, data) {
        setHTML('#course-tab-content', `
            <div class="fade-in">
                <div class="card mb-2">
                    <div class="card-body text-center">
                        <div style="font-size:3rem; font-weight:700; color:var(--primary);">${data.overall_letter || 'N/A'}</div>
                        <div style="font-size:1.2rem; color:var(--text-secondary);">${data.overall_percentage !== null ? data.overall_percentage + '%' : 'No grades yet'}</div>
                        <div class="progress-bar mt-2" style="max-width:300px; margin:0 auto;">
                            <div class="progress-fill ${data.overall_percentage >= 70 ? 'success' : data.overall_percentage >= 50 ? 'warning' : 'danger'}"
                                 style="width:${data.overall_percentage || 0}%"></div>
                        </div>
                    </div>
                </div>

                ${data.categories?.length ? `
                    <h3 class="mb-1" style="font-size:0.9rem; color:var(--text-secondary);">Grade Categories</h3>
                    <div class="stats-grid mb-2">
                        ${data.categories.map(c => `
                            <div class="stat-card">
                                <div class="stat-card-label">${escapeHtml(c.name)}</div>
                                <div class="stat-card-value" style="font-size:1.25rem;">${c.weight}%</div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                <div class="table-container">
                    <table>
                        <thead>
                            <tr><th>Item</th><th>Points Possible</th><th>Points Earned</th><th>Percentage</th></tr>
                        </thead>
                        <tbody>
                            ${data.items.map(item => {
                                const grade = item.grade;
                                const pct = grade?.points_earned !== null && grade?.points_earned !== undefined
                                    ? ((grade.points_earned / item.points_possible) * 100).toFixed(1) : null;
                                return `
                                <tr>
                                    <td><strong>${escapeHtml(item.title)}</strong></td>
                                    <td>${item.points_possible}</td>
                                    <td>${grade?.points_earned !== null && grade?.points_earned !== undefined ? grade.points_earned : '-'}</td>
                                    <td>${pct !== null ? `
                                        <span class="tag tag-${pct >= 70 ? 'success' : pct >= 50 ? 'warning' : 'danger'}">${pct}%</span>
                                    ` : '-'}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `);
    },

    renderFacultyGradebook(courseId, data) {
        const items = data.items || [];
        const students = data.students || [];

        setHTML('#course-tab-content', `
            <div class="fade-in">
                <div class="flex justify-between items-center mb-2">
                    <h2 style="font-size:1.1rem;">Gradebook</h2>
                    <div class="flex gap-1">
                        <button class="btn btn-outline btn-sm" onclick="GradesModule.showAnalytics(${courseId})">Analytics</button>
                    </div>
                </div>

                <div class="table-container" style="overflow-x:auto;">
                    <table>
                        <thead>
                            <tr>
                                <th style="position:sticky; left:0; background:var(--bg); z-index:1;">Student</th>
                                ${items.map(i => `<th style="min-width:100px;" title="${escapeHtml(i.title)}">${escapeHtml(i.title).substring(0, 12)}${i.title.length > 12 ? '...' : ''}<br><span style="font-weight:normal; font-size:0.7rem;">${i.points_possible} pts</span></th>`).join('')}
                                <th>Overall</th>
                                <th>Grade</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${students.map(s => `
                                <tr>
                                    <td style="position:sticky; left:0; background:var(--bg-card); z-index:1;">
                                        <strong>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</strong>
                                    </td>
                                    ${items.map(i => {
                                        const g = s.grades[i.id];
                                        return `<td>
                                            <input type="number" class="form-control" style="width:70px; padding:4px 8px; font-size:0.8rem;"
                                                value="${g?.points_earned !== null && g?.points_earned !== undefined ? g.points_earned : ''}"
                                                min="0" max="${i.points_possible}" step="0.5"
                                                onchange="GradesModule.updateGrade(${courseId}, ${i.id}, ${s.id}, this.value)"
                                                placeholder="-">
                                        </td>`;
                                    }).join('')}
                                    <td><strong>${s.overall_percentage !== null ? s.overall_percentage + '%' : '-'}</strong></td>
                                    <td><span class="tag tag-${s.overall_letter === 'A' || s.overall_letter === 'A-' ? 'success' : s.overall_letter === 'F' ? 'danger' : 'info'}">${s.overall_letter}</span></td>
                                </tr>
                            `).join('')}
                            ${!students.length ? '<tr><td colspan="100" class="text-center text-muted">No students enrolled</td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        `);
    },

    async updateGrade(courseId, gradeItemId, studentId, value) {
        const points = value === '' ? null : parseFloat(value);
        const data = await apiPost(`/grades/course/${courseId}/update`, {
            grade_item_id: gradeItemId,
            student_id: studentId,
            points_earned: points,
        });
        if (data.error) { showToast(data.error, 'error'); }
    },

    async showAnalytics(courseId) {
        const data = await apiGet(`/grades/course/${courseId}/analytics`);
        if (data.error) { showToast(data.error, 'error'); return; }

        const a = data.analytics;
        const dist = a.grade_distribution || {};

        showModal('Course Analytics', `
            <div class="stats-grid mb-2">
                <div class="stat-card">
                    <div class="stat-card-value">${a.enrollment_count}</div>
                    <div class="stat-card-label">Students</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${a.average_grade ? a.average_grade + '%' : 'N/A'}</div>
                    <div class="stat-card-label">Avg Grade</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${a.completion_rate}%</div>
                    <div class="stat-card-label">Completion</div>
                </div>
            </div>

            <h4 class="mb-1">Grade Distribution</h4>
            <div class="chart-container">
                <canvas id="grade-dist-chart" style="width:100%; height:200px;"></canvas>
            </div>

            <div class="stats-grid mt-2">
                <div class="stat-card">
                    <div class="stat-card-value">${a.assignment_count}</div>
                    <div class="stat-card-label">Assignments</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-value">${a.exam_count}</div>
                    <div class="stat-card-label">Exams</div>
                </div>
            </div>
        `, '<button class="btn btn-secondary" onclick="closeModal()">Close</button>', { wide: true });

        renderBarChart('grade-dist-chart',
            ['A', 'B', 'C', 'D', 'F'],
            [dist.A || 0, dist.B || 0, dist.C || 0, dist.D || 0, dist.F || 0],
            ['#28A745', '#4A90D9', '#FFC107', '#E67E22', '#DC3545']
        );
    },

    async renderStudentAnalytics() {
        showLoading();
        const data = await apiGet('/grades/student/analytics');
        if (data.error) { showToast(data.error, 'error'); return; }

        const a = data.analytics;

        setHTML('#page-content', `
            <div class="fade-in">
                <div class="page-header">
                    <h1>My Grades</h1>
                </div>

                <div class="card mb-2">
                    <div class="card-body text-center">
                        <div style="font-size:3rem; font-weight:700; color:var(--primary);">${a.overall_letter}</div>
                        <div style="font-size:1.2rem; color:var(--text-secondary);">${a.overall_average ? a.overall_average + '% Overall' : 'N/A'}</div>
                    </div>
                </div>

                <div class="stats-grid mb-2">
                    ${renderStatCard(a.submitted_assignments + '/' + a.total_assignments, 'Assignments', '#4A90D9', '')}
                    ${renderStatCard(a.completion_rate + '%', 'Completion Rate', '#28A745', '')}
                </div>

                <div class="table-container">
                    <table>
                        <thead><tr><th>Course</th><th>Code</th><th>Percentage</th><th>Grade</th></tr></thead>
                        <tbody>
                            ${a.course_grades.map(g => `
                                <tr style="cursor:pointer" onclick="window.location.hash='#/courses/${g.course_id}'">
                                    <td><strong>${escapeHtml(g.course_title)}</strong></td>
                                    <td>${escapeHtml(g.course_code)}</td>
                                    <td>${g.percentage !== null ? g.percentage + '%' : '-'}</td>
                                    <td><span class="tag tag-${g.letter.startsWith('A') ? 'success' : g.letter === 'F' ? 'danger' : 'info'}">${g.letter}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `);
    }
};
