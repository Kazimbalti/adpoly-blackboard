/* ===== CAF (Course Assessment File) Module ===== */
const CAFModule = {
    async renderForCourse(courseId) {
        const data = await apiGet(`/caf/course/${courseId}`);
        if (data.error) { showToast(data.error, 'error'); return; }

        const cafs = data.cafs || [];
        const user = getUser();
        const isFaculty = user.role === 'faculty' || user.role === 'admin';

        setHTML('#course-tab-content', `
            <div class="fade-in">
                ${isFaculty ? `
                    <div class="mb-2 flex gap-1">
                        <button class="btn btn-primary btn-sm" onclick="CAFModule.showCreateForm(${courseId}, 'course')">+ New Course CAF</button>
                        <button class="btn btn-outline btn-sm" onclick="CAFModule.showCreateForm(${courseId}, 'oct')">+ New OCT CAF</button>
                    </div>
                ` : ''}

                ${cafs.length ? `
                    <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">
                        ${cafs.map(c => `
                            <div class="card" style="cursor:pointer;" onclick="CAFModule.openCAF(${c.id})">
                                <div class="card-body">
                                    <div class="flex justify-between items-center mb-1">
                                        <span class="tag tag-${c.caf_type === 'course' ? 'primary' : 'info'}">${c.caf_type.toUpperCase()} CAF</span>
                                        <span class="tag tag-${c.status === 'completed' ? 'success' : c.status === 'submitted' ? 'warning' : c.status === 'approved' ? 'success' : 'secondary'}">${c.status}</span>
                                    </div>
                                    <h3 style="font-size:1rem; margin:8px 0;">${c.semester || ''} ${c.academic_year || ''}</h3>
                                    <p style="font-size:0.8rem; color:var(--text-muted);">
                                        Instructor: ${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}
                                        ${c.crn ? ` | CRN: ${escapeHtml(c.crn)}` : ''}
                                    </p>
                                    <div class="mt-2">
                                        <div class="flex justify-between" style="font-size:0.8rem; margin-bottom:4px;">
                                            <span>Progress</span>
                                            <strong>${c.progress}%</strong>
                                        </div>
                                        <div class="progress-bar">
                                            <div class="progress-fill ${c.progress >= 100 ? 'success' : c.progress >= 50 ? '' : 'warning'}" style="width:${c.progress}%"></div>
                                        </div>
                                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
                                            ${c.completed_sections}/${c.total_sections} sections completed
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                        </svg>
                        <h3>No CAF Files</h3>
                        <p>Create a Course Assessment File to track course documentation and ABET compliance.</p>
                    </div>
                `}
            </div>
        `);
    },

    showCreateForm(courseId, cafType) {
        showModal(`Create ${cafType.toUpperCase()} CAF`, `
            <form>
                <div class="form-row">
                    <div class="form-group">
                        <label>Semester</label>
                        <select id="caf-semester" class="form-control">
                            <option value="Fall 2025">Fall 2025</option>
                            <option value="Spring 2026" selected>Spring 2026</option>
                            <option value="Summer 2026">Summer 2026</option>
                            <option value="Fall 2026">Fall 2026</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Academic Year</label>
                        <input type="text" id="caf-year" class="form-control" value="2025-2026">
                    </div>
                </div>
                <div class="form-group">
                    <label>CRN / Section Number</label>
                    <input type="text" id="caf-crn" class="form-control" placeholder="e.g. 12345">
                </div>
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="CAFModule.create(${courseId}, '${cafType}')">Create CAF</button>
        `);
    },

    async create(courseId, cafType) {
        const data = await apiPost(`/caf/course/${courseId}`, {
            caf_type: cafType,
            semester: $('#caf-semester').value,
            academic_year: $('#caf-year').value.trim(),
            crn: $('#caf-crn').value.trim()
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('CAF created!', 'success');
        this.openCAF(data.caf.id);
    },

    async openCAF(cafId) {
        showLoading();
        const data = await apiGet(`/caf/${cafId}`);
        if (data.error) { showToast(data.error, 'error'); return; }

        const caf = data.caf;
        const sections = data.sections || [];
        const documents = data.documents || [];
        const folders = data.folder_structure || [];
        const user = getUser();
        const isFaculty = user.role === 'faculty' || user.role === 'admin';

        // Group documents by section
        const docMap = {};
        documents.forEach(d => {
            if (!docMap[d.section_key]) docMap[d.section_key] = [];
            docMap[d.section_key].push(d);
        });

        setHTML('#page-content', `
            <div class="fade-in">
                <div class="breadcrumb">
                    <a href="#/courses/${caf.course_id}">Course</a> /
                    <span>${caf.caf_type.toUpperCase()} CAF</span>
                </div>

                <div class="card mb-2">
                    <div class="card-body">
                        <div class="flex justify-between items-center flex-wrap gap-2">
                            <div>
                                <h1 style="font-size:1.4rem;">
                                    <span class="tag tag-${caf.caf_type === 'course' ? 'primary' : 'info'}" style="font-size:0.75rem;">${caf.caf_type.toUpperCase()}</span>
                                    ${escapeHtml(caf.course_code)} - ${escapeHtml(caf.course_title)}
                                </h1>
                                <p class="text-secondary mt-1" style="font-size:0.85rem;">
                                    ${caf.semester} | ${caf.academic_year} | Instructor: ${escapeHtml(caf.first_name)} ${escapeHtml(caf.last_name)}
                                    ${caf.crn ? ` | CRN: ${caf.crn}` : ''}
                                </p>
                            </div>
                            <div class="flex gap-1 items-center">
                                <span class="tag tag-${caf.status === 'completed' ? 'success' : caf.status === 'submitted' ? 'warning' : 'secondary'}">${caf.status}</span>
                                ${isFaculty && caf.status === 'completed' ? `<button class="btn btn-sm btn-success" onclick="CAFModule.updateStatus(${cafId}, 'submitted')">Submit for Review</button>` : ''}
                                ${isFaculty && caf.status === 'draft' ? `<button class="btn btn-sm btn-outline" onclick="CAFModule.updateStatus(${cafId}, 'in_progress')">Start Working</button>` : ''}
                            </div>
                        </div>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: 280px 1fr; gap:20px;">
                    <!-- Section Navigation -->
                    <div>
                        <div class="card" style="position:sticky; top:80px;">
                            <div class="card-header"><h3 style="font-size:0.9rem;">Sections</h3></div>
                            <div style="max-height:calc(100vh - 250px); overflow-y:auto;">
                                ${sections.map((s, i) => `
                                    <div class="sidebar-item ${i === 0 ? 'active' : ''}" onclick="CAFModule.showSection('${s.section_key}', ${cafId})" data-section="${s.section_key}" style="padding:10px 16px; font-size:0.85rem;">
                                        <span class="status-dot ${s.status === 'completed' ? 'active' : s.status === 'in_progress' ? 'pending' : 'inactive'}"></span>
                                        <span style="flex:1;">${escapeHtml(s.section_name)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        ${folders.length ? `
                            <div class="card mt-2">
                                <div class="card-header"><h3 style="font-size:0.9rem;">CD Structure</h3></div>
                                <div style="padding:8px 16px; font-size:0.8rem;">
                                    ${folders.map(f => `
                                        <div style="padding:4px 0; color:var(--text-secondary);">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#F39C12" stroke-width="2" style="display:inline; vertical-align:middle; margin-right:4px;">
                                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                            </svg>
                                            ${escapeHtml(f)}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Section Content -->
                    <div id="caf-section-content">
                        ${this.renderSectionContent(sections[0], docMap[sections[0]?.section_key] || [], cafId, isFaculty)}
                    </div>
                </div>
            </div>
        `);

        this._currentCAF = caf;
        this._sections = sections;
        this._docMap = docMap;
    },

    showSection(sectionKey, cafId) {
        const section = this._sections.find(s => s.section_key === sectionKey);
        if (!section) return;

        $$('[data-section]').forEach(el => el.classList.remove('active'));
        const navItem = document.querySelector(`[data-section="${sectionKey}"]`);
        if (navItem) navItem.classList.add('active');

        const user = getUser();
        const isFaculty = user.role === 'faculty' || user.role === 'admin';
        setHTML('#caf-section-content',
            this.renderSectionContent(section, this._docMap[sectionKey] || [], cafId, isFaculty)
        );
    },

    renderSectionContent(section, docs, cafId, isFaculty) {
        if (!section) return '<div class="empty-state"><p>Select a section</p></div>';

        let sectionData = {};
        try { sectionData = section.data ? JSON.parse(section.data) : {}; } catch(e) {}

        return `
            <div class="card fade-in">
                <div class="card-header">
                    <div>
                        <h2 style="font-size:1.1rem;">${escapeHtml(section.section_name)}</h2>
                        <span class="tag tag-${section.status === 'completed' ? 'success' : section.status === 'in_progress' ? 'warning' : 'secondary'}" style="font-size:0.7rem;">${section.status}</span>
                    </div>
                    ${isFaculty ? `
                        <div class="flex gap-1">
                            <select id="section-status-select" class="form-control" style="width:auto; padding:4px 30px 4px 8px; font-size:0.8rem;" onchange="CAFModule.updateSectionStatus(${cafId}, '${section.section_key}', this.value)">
                                <option value="empty" ${section.status === 'empty' ? 'selected' : ''}>Empty</option>
                                <option value="in_progress" ${section.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                                <option value="completed" ${section.status === 'completed' ? 'selected' : ''}>Completed</option>
                            </select>
                        </div>
                    ` : ''}
                </div>
                <div class="card-body">
                    <!-- Notes / Data -->
                    ${isFaculty ? `
                        <div class="form-group">
                            <label>Section Notes</label>
                            <textarea id="section-notes" class="form-control" rows="3" placeholder="Add notes for this section...">${escapeHtml(sectionData.notes || '')}</textarea>
                            <button class="btn btn-sm btn-outline mt-1" onclick="CAFModule.saveSectionNotes(${cafId}, '${section.section_key}')">Save Notes</button>
                        </div>
                        <hr style="margin:16px 0; border-color:var(--border);">
                    ` : ''}

                    <!-- Documents -->
                    <h3 style="font-size:0.95rem; margin-bottom:12px;">Documents (${docs.length})</h3>

                    ${isFaculty ? `
                        <div class="file-drop-zone mb-2" style="padding:20px;" onclick="document.getElementById('caf-file-input').click()">
                            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 8px;">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="17 8 12 3 7 8"></polyline>
                                <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                            <p style="font-size:0.85rem;">Click or drag files to upload</p>
                            <input type="file" id="caf-file-input" style="display:none" multiple onchange="CAFModule.uploadFiles(${cafId}, '${section.section_key}', this.files)">
                        </div>
                    ` : ''}

                    ${docs.length ? docs.map(d => `
                        <div class="flex items-center gap-2 mb-1" style="padding:8px 12px; background:var(--bg); border-radius:var(--radius-sm);">
                            ${getFileIcon(d.mime_type, d.file_name)}
                            <div class="flex-1">
                                <strong style="font-size:0.85rem;">${escapeHtml(d.title)}</strong>
                                <div style="font-size:0.75rem; color:var(--text-muted);">${formatFileSize(d.file_size)} | ${formatDate(d.created_at)}</div>
                            </div>
                            <a href="/api/materials/${d.id}/download" class="btn btn-sm btn-ghost">Download</a>
                            ${isFaculty ? `<button class="btn btn-sm btn-ghost text-danger" onclick="CAFModule.deleteDoc(${d.id}, ${cafId})">Delete</button>` : ''}
                        </div>
                    `).join('') : '<p class="text-muted" style="font-size:0.85rem;">No documents uploaded yet.</p>'}
                </div>
            </div>
        `;
    },

    async updateSectionStatus(cafId, sectionKey, status) {
        await apiPut(`/caf/${cafId}/sections/${sectionKey}`, { status });
        // Update local state
        const s = this._sections.find(s => s.section_key === sectionKey);
        if (s) s.status = status;
        // Update nav dot
        const navItem = document.querySelector(`[data-section="${sectionKey}"] .status-dot`);
        if (navItem) navItem.className = `status-dot ${status === 'completed' ? 'active' : status === 'in_progress' ? 'pending' : 'inactive'}`;
    },

    async saveSectionNotes(cafId, sectionKey) {
        const notes = $('#section-notes')?.value || '';
        await apiPut(`/caf/${cafId}/sections/${sectionKey}`, {
            status: 'in_progress',
            data: { notes }
        });
        showToast('Notes saved', 'success');
    },

    async uploadFiles(cafId, sectionKey, files) {
        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('section_key', sectionKey);
            formData.append('title', file.name);
            const data = await apiUpload(`/caf/${cafId}/upload`, formData);
            if (data.error) {
                showToast(`Failed: ${data.error}`, 'error');
            } else {
                showToast(`${file.name} uploaded`, 'success');
            }
        }
        this.openCAF(cafId);
    },

    async deleteDoc(docId, cafId) {
        showConfirm('Delete Document', 'Delete this document?', async () => {
            await apiDelete(`/caf/documents/${docId}`);
            showToast('Deleted', 'success');
            this.openCAF(cafId);
        });
    },

    async updateStatus(cafId, status) {
        await apiPut(`/caf/${cafId}/status`, { status });
        showToast(`CAF status updated to ${status}`, 'success');
        this.openCAF(cafId);
    }
};
