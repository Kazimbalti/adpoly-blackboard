/* ===== Messages Module ===== */
const MessagesModule = {
    async render() {
        showLoading();
        const data = await apiGet('/messages/inbox');
        if (data.error) { showToast(data.error, 'error'); return; }

        setHTML('#page-content', `
            <div class="fade-in">
                <div class="page-header">
                    <h1>Messages</h1>
                    <button class="btn btn-primary" onclick="MessagesModule.showComposeForm()">New Message</button>
                </div>
                <div id="messages-container">
                    ${data.conversations.length ? data.conversations.map(c => {
                        const other = c.participants?.[0] || {};
                        return `
                        <div class="card mb-1" style="cursor:pointer" onclick="MessagesModule.openConversation(${c.id})">
                            <div class="card-body flex items-center gap-2">
                                <div class="avatar">${getInitials(other.first_name, other.last_name)}</div>
                                <div class="flex-1" style="min-width:0;">
                                    <div class="flex justify-between">
                                        <strong style="font-size:0.9rem;">${escapeHtml(other.first_name || 'Unknown')} ${escapeHtml(other.last_name || '')}</strong>
                                        <span style="font-size:0.75rem; color:var(--text-muted);">${formatTimeAgo(c.last_message_at)}</span>
                                    </div>
                                    ${c.subject ? `<div style="font-size:0.8rem; color:var(--text-secondary);">${escapeHtml(c.subject)}</div>` : ''}
                                    <p style="font-size:0.85rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                        ${escapeHtml((c.last_message || '').substring(0, 80))}
                                    </p>
                                </div>
                                ${c.unread_count > 0 ? `<span class="tag tag-primary">${c.unread_count}</span>` : ''}
                            </div>
                        </div>`;
                    }).join('') : `
                        <div class="empty-state">
                            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                            <h3>No messages yet</h3>
                            <p>Start a conversation with your instructors or classmates.</p>
                        </div>
                    `}
                </div>
            </div>
        `);
    },

    async openConversation(convId) {
        showLoading();
        const data = await apiGet(`/messages/conversations/${convId}`);
        if (data.error) { showToast(data.error, 'error'); return; }

        const user = getUser();

        setHTML('#page-content', `
            <div class="fade-in">
                <div class="breadcrumb"><a href="#/messages" style="cursor:pointer">Messages</a> / <span>Conversation</span></div>
                <div class="card" style="max-height:calc(100vh - 240px); display:flex; flex-direction:column;">
                    <div class="card-body flex-1" style="overflow-y:auto; padding-bottom:0;" id="msg-thread">
                        ${data.messages.map(m => `
                            <div class="flex gap-2 mb-2 ${m.sender_id === user.id ? 'flex-row-reverse' : ''}" style="${m.sender_id === user.id ? 'flex-direction:row-reverse' : ''}">
                                <div class="avatar avatar-sm">${getInitials(m.first_name, m.last_name)}</div>
                                <div style="max-width:70%; background: ${m.sender_id === user.id ? 'var(--primary)' : 'var(--bg)'}; color: ${m.sender_id === user.id ? 'white' : 'var(--text)'}; padding:10px 16px; border-radius:var(--radius); ${m.sender_id === user.id ? 'border-top-right-radius:4px' : 'border-top-left-radius:4px'};">
                                    <p style="font-size:0.9rem;">${escapeHtml(m.body)}</p>
                                    <div style="font-size:0.7rem; opacity:0.7; margin-top:4px;">${formatTimeAgo(m.created_at)}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="card-footer">
                        <div class="flex gap-1">
                            <input type="text" id="reply-input" class="form-control" placeholder="Type a message..." style="flex:1"
                                onkeydown="if(event.key==='Enter') MessagesModule.sendReply(${convId})">
                            <button class="btn btn-primary" onclick="MessagesModule.sendReply(${convId})">Send</button>
                        </div>
                    </div>
                </div>
            </div>
        `);

        // Scroll to bottom
        const thread = $('#msg-thread');
        if (thread) thread.scrollTop = thread.scrollHeight;
    },

    async sendReply(convId) {
        const input = $('#reply-input');
        if (!input || !input.value.trim()) return;

        const body = input.value.trim();
        input.value = '';

        const data = await apiPost(`/messages/conversations/${convId}/reply`, { body });
        if (data.error) { showToast(data.error, 'error'); return; }

        this.openConversation(convId);
    },

    showComposeForm() {
        showModal('New Message', `
            <form>
                <div class="form-group">
                    <label>Recipient Email</label>
                    <input type="email" id="msg-recipient-email" class="form-control" placeholder="Enter recipient's email">
                    <input type="hidden" id="msg-recipient-id">
                    <div class="form-hint">Enter the email address of the person you want to message</div>
                </div>
                <div class="form-group">
                    <label>Subject</label>
                    <input type="text" id="msg-subject" class="form-control" placeholder="Optional subject">
                </div>
                <div class="form-group">
                    <label>Message</label>
                    <textarea id="msg-body" class="form-control" rows="4" required></textarea>
                </div>
            </form>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="MessagesModule.sendMessage()">Send</button>
        `);
    },

    async sendMessage() {
        const email = $('#msg-recipient-email').value.trim();
        const body = $('#msg-body').value.trim();

        if (!email || !body) {
            showToast('Recipient and message are required', 'warning');
            return;
        }

        // Look up user by email - we'll use a simple approach
        // In a real app, there would be a user search endpoint
        const data = await apiPost('/messages/conversations', {
            recipient_id: parseInt($('#msg-recipient-id').value) || 0,
            recipient_email: email,
            subject: $('#msg-subject').value.trim(),
            body: body,
        });

        if (data.error) {
            showToast(data.error, 'error');
            return;
        }

        closeModal();
        showToast('Message sent!', 'success');
        this.render();
    }
};
