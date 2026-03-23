/* ===== Reusable UI Components ===== */

// Toast Notifications
function showToast(message, type = 'info', duration = 4000) {
    const container = $('#toast-container');
    const toast = el('div', { className: `toast toast-${type}` }, [
        el('span', { textContent: message }),
        el('button', { className: 'toast-close', textContent: '\u00d7', onClick: () => toast.remove() })
    ]);
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Modal
function showModal(title, bodyHtml, footerHtml = '', options = {}) {
    const overlay = $('#modal-overlay');
    const container = $('#modal-container');

    $('#modal-title').textContent = title;
    setHTML('#modal-body', bodyHtml);
    setHTML('#modal-footer', footerHtml);

    if (options.wide) container.style.maxWidth = '800px';
    else container.style.maxWidth = '560px';

    show(overlay);

    const closeModal = () => hide(overlay);
    $('#modal-close').onclick = closeModal;
    overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

    return closeModal;
}

function closeModal() {
    hide('#modal-overlay');
}

// Confirm Dialog
function showConfirm(title, message, onConfirm) {
    const close = showModal(title, `<p>${message}</p>`,
        `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
         <button class="btn btn-danger" id="confirm-btn">Confirm</button>`
    );
    setTimeout(() => {
        const btn = $('#confirm-btn');
        if (btn) btn.onclick = () => { close(); onConfirm(); };
    }, 0);
}

// Loading
function showLoading(target = '#page-content') {
    setHTML(target, `
        <div class="loading-page">
            <div class="loading-spinner"></div>
            <p>Loading...</p>
        </div>
    `);
}

// Empty State
function showEmptyState(target, icon, title, message, actionHtml = '') {
    setHTML(target, `
        <div class="empty-state">
            ${icon}
            <h3>${title}</h3>
            <p>${message}</p>
            ${actionHtml}
        </div>
    `);
}

// Stat Card
function renderStatCard(value, label, iconBg, icon) {
    return `
        <div class="stat-card">
            <div class="stat-card-icon" style="background: ${iconBg}20; color: ${iconBg}">
                ${icon}
            </div>
            <div class="stat-card-value">${value}</div>
            <div class="stat-card-label">${label}</div>
        </div>
    `;
}

// Course Card
function renderCourseCard(course) {
    const color = course.color || '#4A90D9';
    const faculty = course.faculty_first ? `${course.faculty_first} ${course.faculty_last}` : '';
    return `
        <div class="course-card" onclick="window.location.hash='#/courses/${course.id}'">
            <div class="course-card-banner" style="background: ${color}"></div>
            <div class="course-card-body">
                <div class="course-card-code">${escapeHtml(course.code)}</div>
                <div class="course-card-title">${escapeHtml(course.title)}</div>
                <div class="course-card-meta">
                    ${faculty ? `<span>${escapeHtml(faculty)}</span>` : ''}
                    ${course.semester ? `<span>${escapeHtml(course.semester)}</span>` : ''}
                </div>
            </div>
            <div class="course-card-footer">
                <span>${course.enrollment_count || 0} students</span>
                ${course.is_published ? '<span class="tag tag-success">Published</span>' : '<span class="tag tag-secondary">Draft</span>'}
            </div>
        </div>
    `;
}

// Announcement Card
function renderAnnouncementCard(ann) {
    return `
        <div class="announcement-card ${ann.is_pinned ? 'pinned' : ''}">
            <div class="announcement-meta">
                ${ann.course_code ? `<span class="tag tag-primary">${escapeHtml(ann.course_code)}</span>` : ''}
                <span>${ann.first_name || ann.author_first || ''} ${ann.last_name || ann.author_last || ''}</span>
                <span>${formatTimeAgo(ann.created_at)}</span>
                ${ann.is_pinned ? '<span class="tag tag-warning">Pinned</span>' : ''}
            </div>
            <h3>${escapeHtml(ann.title)}</h3>
            <p>${escapeHtml(ann.body || '')}</p>
        </div>
    `;
}

// Deadline Item
function renderDeadlineItem(item) {
    const due = item.due_date ? new Date(item.due_date + 'Z') : null;
    const isPast = due && due < new Date();
    const submitted = item.submission_id || item.submitted_at;

    let statusClass = 'tag-warning';
    let statusText = 'Pending';
    if (submitted) { statusClass = 'tag-success'; statusText = 'Submitted'; }
    else if (isPast) { statusClass = 'tag-danger'; statusText = 'Overdue'; }

    return `
        <div class="deadline-item">
            ${due ? `
                <div class="deadline-date">
                    <div class="day">${due.getDate()}</div>
                    <div class="month">${due.toLocaleString('en', { month: 'short' })}</div>
                </div>
            ` : '<div class="deadline-date"><div class="day">--</div></div>'}
            <div class="deadline-info">
                <h4>${escapeHtml(item.title)}</h4>
                <p>${item.course_code || ''} ${item.points ? `| ${item.points} pts` : ''}</p>
            </div>
            <span class="deadline-status tag ${statusClass}">${statusText}</span>
        </div>
    `;
}

// Bar Chart (Canvas-based)
function renderBarChart(canvasId, labels, data, colors) {
    setTimeout(() => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width = canvas.offsetWidth;
        const h = canvas.height = 200;
        const padding = { top: 20, right: 20, bottom: 40, left: 40 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;
        const maxVal = Math.max(...data, 1);
        const barWidth = chartW / labels.length * 0.6;
        const gap = chartW / labels.length * 0.4;

        ctx.clearRect(0, 0, w, h);

        // Gridlines
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + chartH * (1 - i / 4);
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();

            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim();
            ctx.font = '11px system-ui';
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxVal * i / 4), padding.left - 8, y + 4);
        }

        // Bars
        labels.forEach((label, i) => {
            const x = padding.left + i * (chartW / labels.length) + gap / 2;
            const barH = (data[i] / maxVal) * chartH;
            const y = padding.top + chartH - barH;

            ctx.fillStyle = colors[i % colors.length];
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
            ctx.fill();

            // Value on top
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
            ctx.font = 'bold 12px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(data[i], x + barWidth / 2, y - 6);

            // Label
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim();
            ctx.font = '12px system-ui';
            ctx.fillText(label, x + barWidth / 2, h - 10);
        });
    }, 100);
}

// File type icon
function getFileIcon(mimeType, fileName) {
    const ext = fileName?.split('.').pop()?.toLowerCase() || '';
    if (mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) {
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#4A90D9" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
    }
    if (mimeType?.includes('pdf') || ext === 'pdf') {
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#DC3545" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
    }
    if (mimeType?.includes('video') || ['mp4', 'avi', 'mov'].includes(ext)) {
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#9B59B6" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>';
    }
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#6C757D" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
}
