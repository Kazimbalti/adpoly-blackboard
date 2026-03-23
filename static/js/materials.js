/* ===== Materials Module ===== */
const MaterialsModule = {
    async renderForCourse(courseId) {
        const data = await apiGet(`/materials/course/${courseId}`);
        if (data.error) { showToast(data.error, 'error'); return; }

        const user = getUser();
        const isFaculty = user.role === 'faculty' || user.role === 'admin';

        setHTML('#course-tab-content', `
            <div class="fade-in">
                ${isFaculty ? `
                    <div class="mb-2 flex gap-1 flex-wrap">
                        <button class="btn btn-primary btn-sm" onclick="MaterialsModule.showUploadForm(${courseId})">Upload File</button>
                        <button class="btn btn-secondary btn-sm" onclick="MaterialsModule.showAddLinkForm(${courseId})">Add Link</button>
                        <button class="btn btn-sm" style="background:#0078D4; color:white;" onclick="MaterialsModule.showOneDriveShare(${courseId})">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" stroke-width="2" style="margin-right:2px;"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
                            Share from OneDrive
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="MaterialsModule.showCreateFolderForm(${courseId})">New Folder</button>
                    </div>
                ` : ''}

                <div id="file-drop-area" class="file-drop-zone mb-2" style="${isFaculty ? '' : 'display:none'}">
                    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    <p>Drag & drop files here to upload</p>
                    <p class="hint">or click to browse (max 50MB)</p>
                    <input type="file" id="file-input-drop" style="display:none" multiple>
                </div>

                ${data.folders.length ? `
                    <h3 class="mb-1" style="font-size:0.9rem; color:var(--text-secondary);">Folders</h3>
                    <div class="mb-2">
                        ${data.folders.map(f => `
                            <div class="card mb-1" style="cursor:pointer;">
                                <div class="card-body flex items-center gap-1">
                                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#F39C12" stroke-width="2">
                                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                    </svg>
                                    <strong>${escapeHtml(f.name)}</strong>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                <div id="materials-list">
                    ${data.materials.length ? data.materials.map(m => `
                        <div class="card mb-1">
                            <div class="card-body flex items-center gap-2">
                                ${getFileIcon(m.mime_type, m.file_name)}
                                <div class="flex-1">
                                    <strong style="font-size:0.9rem;">${escapeHtml(m.title)}</strong>
                                    ${m.description ? `<p style="font-size:0.8rem; color:var(--text-secondary);">${escapeHtml(m.description)}</p>` : ''}
                                    <div class="flex gap-1 mt-1" style="font-size:0.75rem; color:var(--text-muted);">
                                        <span>${m.material_type === 'file' ? formatFileSize(m.file_size) : 'Link'}</span>
                                        <span>${formatDate(m.created_at)}</span>
                                    </div>
                                </div>
                                <div class="flex gap-1">
                                    ${m.material_type === 'file' ? `<a href="/api/materials/${m.id}/download" class="btn btn-sm btn-outline">Download</a>` : ''}
                                    ${m.material_type === 'link' ? `<a href="${escapeHtml(m.url)}" target="_blank" class="btn btn-sm btn-outline">Open</a>` : ''}
                                    ${isFaculty ? `<button class="btn btn-ghost btn-sm text-danger" onclick="MaterialsModule.deleteMaterial(${m.id}, ${courseId})">Delete</button>` : ''}
                                </div>
                            </div>
                        </div>
                    `).join('') : '<div class="empty-state"><h3>No materials yet</h3><p>Course materials will appear here.</p></div>'}
                </div>
            </div>
        `);

        if (isFaculty) this.setupDragDrop(courseId);
    },

    setupDragDrop(courseId) {
        const zone = $('#file-drop-area');
        const input = $('#file-input-drop');
        if (!zone || !input) return;

        zone.onclick = () => input.click();

        zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('dragover'); };
        zone.ondragleave = () => zone.classList.remove('dragover');
        zone.ondrop = (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            this.uploadFiles(e.dataTransfer.files, courseId);
        };

        input.onchange = () => {
            if (input.files.length) this.uploadFiles(input.files, courseId);
        };
    },

    async uploadFiles(files, courseId) {
        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('title', file.name);

            showToast(`Uploading ${file.name}...`, 'info', 2000);
            const data = await apiUpload(`/materials/course/${courseId}/upload`, formData);
            if (data.error) {
                showToast(`Failed to upload ${file.name}: ${data.error}`, 'error');
            } else {
                showToast(`${file.name} uploaded!`, 'success');
            }
        }
        this.renderForCourse(courseId);
    },

    showUploadForm(courseId) {
        showModal('Upload Material', `
            <form id="upload-form" enctype="multipart/form-data">
                <div class="form-group">
                    <label>File</label>
                    <input type="file" id="upload-file" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" id="upload-title" class="form-control">
                    <div class="form-hint">Leave blank to use filename</div>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="upload-desc" class="form-control" rows="2"></textarea>
                </div>
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="MaterialsModule.submitUpload(${courseId})">Upload</button>
        `);
    },

    async submitUpload(courseId) {
        const file = $('#upload-file').files[0];
        if (!file) { showToast('Please select a file', 'warning'); return; }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', $('#upload-title').value.trim() || file.name);
        formData.append('description', $('#upload-desc').value.trim());

        const data = await apiUpload(`/materials/course/${courseId}/upload`, formData);
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Material uploaded!', 'success');
        this.renderForCourse(courseId);
    },

    showAddLinkForm(courseId) {
        showModal('Add Link', `
            <form>
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" id="link-title" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>URL</label>
                    <input type="url" id="link-url" class="form-control" placeholder="https://..." required>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="link-desc" class="form-control" rows="2"></textarea>
                </div>
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="MaterialsModule.submitLink(${courseId})">Add Link</button>
        `);
    },

    async submitLink(courseId) {
        const data = await apiPost(`/materials/course/${courseId}/link`, {
            title: $('#link-title').value.trim(),
            url: $('#link-url').value.trim(),
            description: $('#link-desc').value.trim(),
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Link added!', 'success');
        this.renderForCourse(courseId);
    },

    showOneDriveShare(courseId) {
        showModal('Share from OneDrive', `
            <div style="text-align:center; margin-bottom:20px;">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#0078D4" stroke-width="1.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path>
                </svg>
                <h3 style="margin-top:8px; color:#0078D4;">OneDrive Integration</h3>
            </div>
            <div class="form-group">
                <label>File/Folder Title</label>
                <input type="text" id="od-title" class="form-control" placeholder="e.g. Lecture 5 Slides" required>
            </div>
            <div class="form-group">
                <label>OneDrive Share Link</label>
                <input type="url" id="od-url" class="form-control" placeholder="Paste your OneDrive sharing link here..." required>
                <div class="form-hint">
                    Open OneDrive, right-click the file/folder, select "Share" &rarr; "Copy link"
                </div>
            </div>
            <div class="form-group">
                <label>Description (optional)</label>
                <textarea id="od-desc" class="form-control" rows="2" placeholder="Brief description of the shared content"></textarea>
            </div>
            <div style="background:var(--info-bg); padding:12px; border-radius:var(--radius-sm); font-size:0.8rem; color:var(--info);">
                <strong>How to get a share link:</strong><br>
                1. Go to <a href="https://onedrive.live.com" target="_blank" style="color:var(--info);">onedrive.live.com</a> or your organization's OneDrive<br>
                2. Right-click the file or folder<br>
                3. Click "Share" then "Copy link"<br>
                4. Paste the link above
            </div>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" style="background:#0078D4;" onclick="MaterialsModule.submitOneDriveShare(${courseId})">Share to Course</button>
        `);
    },

    async submitOneDriveShare(courseId) {
        const title = $('#od-title').value.trim();
        const url = $('#od-url').value.trim();
        if (!title || !url) { showToast('Title and share link are required', 'warning'); return; }

        const data = await apiPost('/onedrive/share', {
            course_id: courseId,
            title: title,
            share_url: url,
            description: $('#od-desc').value.trim() || 'Shared from OneDrive',
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('OneDrive file shared to course!', 'success');
        this.renderForCourse(courseId);
    },

    showCreateFolderForm(courseId) {
        showModal('Create Folder', `
            <div class="form-group">
                <label>Folder Name</label>
                <input type="text" id="folder-name" class="form-control" required>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="MaterialsModule.createFolder(${courseId})">Create</button>
        `);
    },

    async createFolder(courseId) {
        const data = await apiPost(`/materials/course/${courseId}/folders`, {
            name: $('#folder-name').value.trim(),
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Folder created!', 'success');
        this.renderForCourse(courseId);
    },

    async deleteMaterial(materialId, courseId) {
        showConfirm('Delete Material', 'Are you sure you want to delete this material?', async () => {
            const data = await apiDelete(`/materials/${materialId}`);
            if (data.error) { showToast(data.error, 'error'); return; }
            showToast('Material deleted', 'success');
            this.renderForCourse(courseId);
        });
    }
};
