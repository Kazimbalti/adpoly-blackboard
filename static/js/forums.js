/* ===== Forums Module ===== */
const ForumsModule = {
    async renderForCourse(courseId) {
        const data = await apiGet(`/forums/course/${courseId}`);
        if (data.error) { showToast(data.error, 'error'); return; }

        setHTML('#course-tab-content', `
            <div class="fade-in">
                <div class="mb-2">
                    <button class="btn btn-primary btn-sm" onclick="ForumsModule.showCreateThread(${courseId})">+ New Discussion</button>
                </div>
                ${data.threads.length ? data.threads.map(t => `
                    <div class="card mb-1" style="cursor:pointer" onclick="ForumsModule.openThread(${t.id})">
                        <div class="card-body">
                            <div class="flex justify-between items-center gap-1">
                                <div class="flex items-center gap-2">
                                    <div class="avatar avatar-sm">${getInitials(t.first_name, t.last_name)}</div>
                                    <div>
                                        <h3 style="font-size:0.95rem; font-weight:600;">
                                            ${t.is_pinned ? '<span class="tag tag-warning" style="font-size:0.65rem; margin-right:4px;">Pinned</span>' : ''}
                                            ${t.is_locked ? '<span class="tag tag-secondary" style="font-size:0.65rem; margin-right:4px;">Locked</span>' : ''}
                                            ${escapeHtml(t.title)}
                                        </h3>
                                        <div style="font-size:0.8rem; color:var(--text-muted);">
                                            ${escapeHtml(t.first_name)} ${escapeHtml(t.last_name)} | ${formatTimeAgo(t.created_at)}
                                        </div>
                                    </div>
                                </div>
                                <div class="flex gap-2" style="font-size:0.8rem; color:var(--text-muted);">
                                    <span>${t.reply_count || 0} replies</span>
                                    <span>${t.view_count || 0} views</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('') : '<div class="empty-state"><h3>No discussions yet</h3><p>Start a new discussion to engage with your class.</p></div>'}
            </div>
        `);
    },

    async openThread(threadId) {
        showLoading();
        const data = await apiGet(`/forums/threads/${threadId}`);
        if (data.error) { showToast(data.error, 'error'); return; }

        const thread = data.thread;
        const posts = data.posts || [];
        const user = getUser();
        const isFaculty = user.role === 'faculty' || user.role === 'admin';

        setHTML('#page-content', `
            <div class="fade-in">
                <div class="breadcrumb">
                    <a href="#/dashboard">Dashboard</a> / <span>Discussion</span>
                </div>

                <div class="card mb-2">
                    <div class="card-body">
                        <div class="flex justify-between items-center mb-2">
                            <h1 style="font-size:1.3rem;">${escapeHtml(thread.title)}</h1>
                            ${isFaculty ? `
                                <div class="flex gap-1">
                                    <button class="btn btn-ghost btn-sm" onclick="ForumsModule.pinThread(${threadId})">${thread.is_pinned ? 'Unpin' : 'Pin'}</button>
                                    <button class="btn btn-ghost btn-sm" onclick="ForumsModule.lockThread(${threadId})">${thread.is_locked ? 'Unlock' : 'Lock'}</button>
                                </div>
                            ` : ''}
                        </div>
                        <div class="flex items-center gap-2 mb-2">
                            <div class="avatar avatar-sm">${getInitials(thread.first_name, thread.last_name)}</div>
                            <div>
                                <strong style="font-size:0.85rem;">${escapeHtml(thread.first_name)} ${escapeHtml(thread.last_name)}</strong>
                                <span class="tag tag-${thread.role === 'faculty' ? 'primary' : 'secondary'}" style="font-size:0.65rem;">${thread.role}</span>
                            </div>
                            <span style="font-size:0.8rem; color:var(--text-muted);">${formatTimeAgo(thread.created_at)}</span>
                        </div>
                        <div style="font-size:0.95rem; line-height:1.7;">${thread.body}</div>
                    </div>
                </div>

                <h3 class="mb-2" style="font-size:1rem;">Replies (${posts.length})</h3>

                ${posts.map(p => `
                    <div class="card mb-1">
                        <div class="card-body">
                            <div class="flex items-center gap-2 mb-1">
                                <div class="avatar avatar-sm">${getInitials(p.first_name, p.last_name)}</div>
                                <strong style="font-size:0.85rem;">${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</strong>
                                <span class="tag tag-${p.role === 'faculty' ? 'primary' : 'secondary'}" style="font-size:0.65rem;">${p.role}</span>
                                <span style="font-size:0.8rem; color:var(--text-muted);">${formatTimeAgo(p.created_at)}</span>
                            </div>
                            <div style="font-size:0.9rem; line-height:1.7;">${escapeHtml(p.body)}</div>
                        </div>
                    </div>
                `).join('')}

                ${!thread.is_locked ? `
                    <div class="card mt-2">
                        <div class="card-body">
                            <div class="form-group mb-1">
                                <label>Reply</label>
                                <textarea id="reply-body" class="form-control" rows="3" placeholder="Write your reply..."></textarea>
                            </div>
                            <button class="btn btn-primary btn-sm" onclick="ForumsModule.postReply(${threadId})">Post Reply</button>
                        </div>
                    </div>
                ` : '<div class="card mt-2"><div class="card-body text-center text-muted">This discussion is locked.</div></div>'}
            </div>
        `);
    },

    showCreateThread(courseId) {
        showModal('New Discussion', `
            <form>
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" id="thread-title" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Body</label>
                    <textarea id="thread-body" class="form-control" rows="5" required></textarea>
                </div>
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="ForumsModule.createThread(${courseId})">Post</button>
        `);
    },

    async createThread(courseId) {
        const data = await apiPost(`/forums/course/${courseId}`, {
            title: $('#thread-title').value.trim(),
            body: $('#thread-body').value.trim(),
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Discussion posted!', 'success');
        this.renderForCourse(courseId);
    },

    async postReply(threadId) {
        const body = $('#reply-body')?.value?.trim();
        if (!body) { showToast('Reply cannot be empty', 'warning'); return; }

        const data = await apiPost(`/forums/threads/${threadId}/reply`, { body });
        if (data.error) { showToast(data.error, 'error'); return; }
        showToast('Reply posted!', 'success');
        this.openThread(threadId);
    },

    async pinThread(threadId) {
        await apiPost(`/forums/threads/${threadId}/pin`, {});
        this.openThread(threadId);
    },

    async lockThread(threadId) {
        await apiPost(`/forums/threads/${threadId}/lock`, {});
        this.openThread(threadId);
    }
};
