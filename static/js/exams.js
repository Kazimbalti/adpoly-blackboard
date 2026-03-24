/* ===== Exams Module ===== */
const ExamsModule = {
    currentAttempt: null,
    answers: {},
    timerInterval: null,

    async renderForCourse(courseId) {
        const data = await apiGet(`/exams/course/${courseId}`);
        if (data.error) { showToast(data.error, 'error'); return; }

        const user = getUser();
        const isFaculty = user.role === 'faculty' || user.role === 'admin';
        const now = new Date();

        setHTML('#course-tab-content', `
            <div class="fade-in">
                ${isFaculty ? `
                    <div class="mb-2">
                        <button class="btn btn-primary btn-sm" onclick="ExamsModule.showCreateForm(${courseId})">+ Create Exam</button>
                    </div>
                ` : ''}
                ${data.exams.length ? data.exams.map(e => {
                    const hasAttempt = e.attempt;
                    const attemptsUsed = e.attempts_used || 0;
                    const deadline = e.end_window;
                    const isPast = deadline && new Date(deadline + 'Z') < now;
                    const deadlineClass = isPast ? 'text-danger' : 'text-secondary';

                    return `
                    <div class="card mb-2">
                        <div class="card-body">
                            <div class="flex justify-between items-center flex-wrap gap-1">
                                <div>
                                    <h3 style="font-size:1.05rem; font-weight:600;">${escapeHtml(e.title)}</h3>
                                    <div class="flex gap-2 mt-1 flex-wrap" style="font-size:0.8rem; color:var(--text-muted);">
                                        <span class="tag tag-${e.exam_type === 'quiz' ? 'info' : e.exam_type === 'midterm' ? 'warning' : 'danger'}">${e.exam_type}</span>
                                        <span>${e.duration_minutes} min</span>
                                        <span>${e.total_points} pts</span>
                                        ${e.proctor_enabled ? '<span class="tag tag-danger">Proctored</span>' : ''}
                                        ${e.lockdown_browser ? '<span class="tag tag-warning">Lockdown</span>' : ''}
                                        ${e.max_attempts > 1 ? `<span class="tag tag-secondary">${e.max_attempts} attempts</span>` : ''}
                                    </div>
                                    ${deadline ? `<div class="${deadlineClass}" style="font-size:0.8rem; margin-top:4px;">Due: ${formatDateTime(deadline)}${isPast ? ' (Closed)' : ''}</div>` : ''}
                                </div>
                                <div class="flex gap-1 items-center flex-wrap">
                                    ${!isFaculty && attemptsUsed > 0 ? `<span class="tag tag-secondary">${attemptsUsed} of ${e.max_attempts} attempts</span>` : ''}
                                    ${!isFaculty && !hasAttempt && !isPast ? `
                                        <button class="btn btn-primary btn-sm" onclick="ExamsModule.startExam(${e.id})">Start Exam</button>
                                    ` : ''}
                                    ${!isFaculty && hasAttempt ? `
                                        ${hasAttempt.status === 'in_progress' ? `
                                            <button class="btn btn-warning btn-sm" onclick="ExamsModule.resumeExam(${e.id})">Resume</button>
                                        ` : `
                                            <span class="tag tag-${hasAttempt.status === 'graded' ? 'success' : 'warning'}">
                                                ${hasAttempt.total_score !== null ? hasAttempt.total_score + '/' + e.total_points : 'Awaiting Grade'}
                                            </span>
                                            ${hasAttempt.auto_submitted ? '<span class="tag tag-danger">Auto-submitted</span>' : ''}
                                            ${attemptsUsed < e.max_attempts && !isPast ? `
                                                <button class="btn btn-outline btn-sm" onclick="ExamsModule.startExam(${e.id})">Retry</button>
                                            ` : ''}
                                        `}
                                    ` : ''}
                                    ${!isFaculty && isPast && !hasAttempt ? '<span class="tag tag-danger">Missed</span>' : ''}
                                    ${isFaculty ? `
                                        <button class="btn btn-outline btn-sm" onclick="ExamsModule.viewResults(${e.id})">Results (${e.attempt_count || 0})</button>
                                        ${e.needs_grading ? `<span class="tag tag-warning">${e.needs_grading} to grade</span>` : ''}
                                        <button class="btn btn-sm btn-secondary" onclick="ExamsModule.manageQuestions(${e.id})">Questions</button>
                                        <button class="btn btn-sm btn-ghost" onclick="ExamsModule.showEditForm(${e.id}, ${courseId})">Edit</button>
                                        ${!e.is_published ? `<button class="btn btn-sm btn-success" onclick="ExamsModule.publish(${e.id}, ${courseId})">Publish</button>` : ''}
                                    ` : ''}
                                </div>
                            </div>
                            ${e.description ? `<p class="mt-1" style="font-size:0.85rem; color:var(--text-secondary);">${escapeHtml(e.description)}</p>` : ''}
                        </div>
                    </div>`;
                }).join('') : '<div class="empty-state"><h3>No exams</h3></div>'}
            </div>
        `);
    },

    async startExam(examId) {
        showConfirm('Start Exam', 'Are you sure you want to start this exam? The timer will begin immediately.', async () => {
            const data = await apiPost(`/exams/${examId}/start`, {});
            if (data.error) { showToast(data.error, 'error'); return; }
            this.launchExamInterface(data);
        });
    },

    async resumeExam(examId) {
        const data = await apiPost(`/exams/${examId}/start`, {});
        if (data.error) { showToast(data.error, 'error'); return; }
        this.launchExamInterface(data);
    },

    launchExamInterface(data) {
        this.currentAttempt = data.attempt;
        this.answers = {};
        const exam = data.exam;
        const questions = data.questions;

        if (exam.lockdown_browser) document.body.classList.add('lockdown-active');

        if (exam.proctor_enabled) {
            ProctorModule.init(data.attempt.id, {
                webcam: exam.require_webcam,
                tabSwitch: exam.detect_tab_switch,
                copyPaste: exam.detect_copy_paste,
                maxViolations: exam.max_violations
            });
        }

        setHTML('#page-content', `
            <div class="exam-container fade-in">
                <div class="exam-header">
                    <div>
                        <h2 style="font-size:1.1rem; font-weight:600;">${escapeHtml(exam.title)}</h2>
                        <div class="exam-info">
                            <span>${questions.length} questions</span>
                            <span>${exam.total_points} points</span>
                            ${exam.end_window ? `<span>Due: ${formatDateTime(exam.end_window)}</span>` : ''}
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <div class="exam-violation-count safe" id="violation-display">
                            <span id="violation-count">0</span>/${exam.max_violations} violations
                        </div>
                        <div class="exam-timer" id="exam-timer">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            <span id="timer-display">${formatTimer(data.time_remaining)}</span>
                        </div>
                    </div>
                </div>

                <div class="question-nav">
                    <h3>Questions</h3>
                    <div class="question-nav-grid">
                        ${questions.map((q, i) => `
                            <button class="question-nav-btn" id="qnav-${i}" onclick="ExamsModule.scrollToQuestion(${i})">${i + 1}</button>
                        `).join('')}
                    </div>
                </div>

                <div id="exam-questions">
                    ${questions.map((q, i) => this.renderQuestion(q, i)).join('')}
                </div>

                <div class="exam-submit-area">
                    <div class="exam-submit-summary">
                        <div><div class="count" id="answered-count">0</div>Answered</div>
                        <div><div class="count">${questions.length}</div>Total</div>
                    </div>
                    <p>Make sure you've answered all questions before submitting.</p>
                    <button class="btn btn-primary btn-lg" onclick="ExamsModule.submitExam()">Submit Exam</button>
                </div>
            </div>
        `);

        this.startTimer(data.time_remaining, data.attempt.exam_id);
    },

    renderQuestion(q, index) {
        let answerHtml = '';
        const qtype = q.question_type;

        // Image display for image-based questions
        const imageHtml = q.image_path ? `<div class="question-image mb-1"><img src="/static/${escapeHtml(q.image_path)}" style="max-width:100%; border-radius:var(--radius-sm);"></div>` : '';

        if (qtype === 'mcq' || qtype === 'true_false' || qtype === 'image_mcq') {
            const options = q.options || (qtype === 'true_false' ? ['True', 'False'] : []);
            answerHtml = `
                <div class="mcq-options">
                    ${options.map((opt, oi) => `
                        <div class="mcq-option" onclick="ExamsModule.selectOption(${q.id}, '${escapeHtml(String(opt))}', this)" data-qid="${q.id}">
                            <div class="mcq-radio"></div>
                            <span>${escapeHtml(String(opt))}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (qtype === 'multiple_answer') {
            const options = q.options || [];
            answerHtml = `
                <div class="mcq-options" data-multi="true">
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px;">Select all that apply</div>
                    ${options.map((opt, oi) => `
                        <div class="mcq-option" onclick="ExamsModule.toggleMultiOption(${q.id}, '${escapeHtml(String(opt))}', this)" data-qid="${q.id}">
                            <div class="mcq-checkbox"></div>
                            <span>${escapeHtml(String(opt))}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (qtype === 'fill_blank') {
            answerHtml = `
                <input type="text" class="form-control" placeholder="Type your answer here..."
                    oninput="ExamsModule.setAnswer(${q.id}, this.value)" data-qid="${q.id}">
            `;
        } else if (qtype === 'matching') {
            const leftItems = q.matching_left_items || [];
            const rightOptions = q.matching_right_options || [];
            answerHtml = `
                <div class="matching-question" id="matching-${q.id}">
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px;">Match each item on the left with the correct item on the right</div>
                    ${leftItems.map((left, i) => `
                        <div class="flex items-center gap-2 mb-1" style="padding:8px; background:var(--bg); border-radius:var(--radius-sm);">
                            <strong style="min-width:40%; font-size:0.9rem;">${escapeHtml(left)}</strong>
                            <select class="form-control" style="flex:1;" onchange="ExamsModule.setMatchAnswer(${q.id}, '${escapeHtml(left)}', this.value)">
                                <option value="">-- Select --</option>
                                ${rightOptions.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('')}
                            </select>
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (qtype === 'ordering') {
            const items = q.ordering_items || [];
            answerHtml = `
                <div class="ordering-question" id="ordering-${q.id}">
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:8px;">Drag items into the correct order (or use arrows)</div>
                    <div id="order-list-${q.id}">
                        ${items.map((item, i) => `
                            <div class="order-item flex items-center gap-2 mb-1" data-value="${escapeHtml(item)}" style="padding:10px 12px; background:var(--bg); border-radius:var(--radius-sm); border:1px solid var(--border); cursor:grab;">
                                <span style="color:var(--text-muted); font-weight:600; min-width:24px;">${i + 1}.</span>
                                <span style="flex:1;">${escapeHtml(item)}</span>
                                <button class="btn btn-ghost btn-sm" onclick="ExamsModule.moveOrderItem(${q.id}, ${i}, -1)" ${i === 0 ? 'disabled' : ''}>&#9650;</button>
                                <button class="btn btn-ghost btn-sm" onclick="ExamsModule.moveOrderItem(${q.id}, ${i}, 1)" ${i === items.length - 1 ? 'disabled' : ''}>&#9660;</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            // Set initial order as answer
            setTimeout(() => this.updateOrderAnswer(q.id), 0);
        } else if (qtype === 'numeric') {
            answerHtml = `
                <input type="number" step="any" class="form-control" placeholder="Enter a number..."
                    oninput="ExamsModule.setAnswer(${q.id}, this.value)" data-qid="${q.id}" style="max-width:300px;">
            `;
        } else if (qtype === 'short_answer') {
            answerHtml = `
                <textarea class="form-control" rows="3" placeholder="Enter your answer..."
                    oninput="ExamsModule.setAnswer(${q.id}, this.value)" data-qid="${q.id}"></textarea>
            `;
        } else if (qtype === 'essay') {
            const minWords = q.word_limit_min || 0;
            const maxWords = q.word_limit || 0;
            answerHtml = `
                <div class="essay-answer">
                    <textarea class="form-control" rows="8" placeholder="Write your essay answer..."
                        oninput="ExamsModule.setAnswer(${q.id}, this.value); ExamsModule.updateWordCount(this, ${maxWords}, ${minWords})"
                        data-qid="${q.id}"></textarea>
                    <div class="word-count" id="wc-${q.id}">
                        0 words${minWords ? ` (min: ${minWords})` : ''}${maxWords ? ` (max: ${maxWords})` : ''}
                    </div>
                </div>
            `;
        } else if (qtype === 'file_upload') {
            const allowedTypes = q.allowed_file_types || '';
            answerHtml = `
                <div class="file-upload-answer">
                    <input type="file" class="form-control" id="file-${q.id}"
                        ${allowedTypes ? `accept="${escapeHtml(allowedTypes)}"` : ''}
                        onchange="ExamsModule.setFileAnswer(${q.id}, this)">
                    ${allowedTypes ? `<div class="form-hint">Allowed: ${escapeHtml(allowedTypes)}</div>` : ''}
                </div>
            `;
        } else if (qtype === 'hotspot') {
            answerHtml = `
                <div class="hotspot-question" style="position:relative; display:inline-block;">
                    ${q.image_path ? `<img src="/static/${escapeHtml(q.image_path)}" style="max-width:100%; cursor:crosshair;" onclick="ExamsModule.addHotspotClick(${q.id}, event, this)">` : '<p class="text-muted">Image not available</p>'}
                    <div id="hotspot-clicks-${q.id}" style="position:absolute; top:0; left:0; pointer-events:none;"></div>
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">Click on the correct area(s)</div>
                </div>
            `;
        }

        return `
            <div class="question-card" id="question-${index}" data-qid="${q.id}">
                <div class="question-number">
                    <span>Question ${index + 1}</span>
                    <span class="question-points">${q.points} pts | <span class="tag tag-secondary" style="font-size:0.7rem;">${this.getTypeLabel(qtype)}</span></span>
                </div>
                ${imageHtml}
                <div class="question-text">${q.question_text}</div>
                ${answerHtml}
            </div>
        `;
    },

    getTypeLabel(type) {
        const labels = {
            mcq: 'MCQ', multiple_answer: 'Multi-Select', true_false: 'True/False',
            fill_blank: 'Fill in Blank', matching: 'Matching', ordering: 'Ordering',
            short_answer: 'Short Answer', essay: 'Essay', numeric: 'Numeric',
            hotspot: 'Hotspot', image_mcq: 'Image MCQ', file_upload: 'File Upload'
        };
        return labels[type] || type;
    },

    selectOption(questionId, value, elem) {
        $$(`[data-qid="${questionId}"].mcq-option`).forEach(o => o.classList.remove('selected'));
        elem.classList.add('selected');
        this.setAnswer(questionId, value);
    },

    toggleMultiOption(questionId, value, elem) {
        elem.classList.toggle('selected');
        const selected = [];
        $$(`[data-qid="${questionId}"].mcq-option.selected`).forEach(o => {
            selected.push(o.querySelector('span').textContent);
        });
        this.setAnswer(questionId, JSON.stringify(selected));
    },

    setMatchAnswer(questionId, left, right) {
        if (!this._matchAnswers) this._matchAnswers = {};
        if (!this._matchAnswers[questionId]) this._matchAnswers[questionId] = {};
        this._matchAnswers[questionId][left] = right;
        this.setAnswer(questionId, JSON.stringify(this._matchAnswers[questionId]));
    },

    moveOrderItem(questionId, index, direction) {
        const list = $(`#order-list-${questionId}`);
        if (!list) return;
        const items = [...list.children];
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= items.length) return;

        if (direction === -1) {
            list.insertBefore(items[index], items[newIndex]);
        } else {
            list.insertBefore(items[newIndex], items[index]);
        }

        // Re-render numbers and buttons
        const updated = [...list.children];
        updated.forEach((item, i) => {
            item.querySelector('span:first-child').textContent = `${i + 1}.`;
            const btns = item.querySelectorAll('button');
            btns[0].disabled = i === 0;
            btns[1].disabled = i === updated.length - 1;
        });

        this.updateOrderAnswer(questionId);
    },

    updateOrderAnswer(questionId) {
        const list = $(`#order-list-${questionId}`);
        if (!list) return;
        const order = [...list.children].map(item => item.dataset.value);
        this.setAnswer(questionId, JSON.stringify(order));
    },

    addHotspotClick(questionId, event, img) {
        const rect = img.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width * 100).toFixed(1);
        const y = ((event.clientY - rect.top) / rect.height * 100).toFixed(1);

        if (!this._hotspotClicks) this._hotspotClicks = {};
        if (!this._hotspotClicks[questionId]) this._hotspotClicks[questionId] = [];
        this._hotspotClicks[questionId].push({ x: parseFloat(x), y: parseFloat(y) });

        // Show marker
        const container = $(`#hotspot-clicks-${questionId}`);
        if (container) {
            container.innerHTML += `<div style="position:absolute; left:${x}%; top:${y}%; width:12px; height:12px; background:red; border-radius:50%; transform:translate(-50%,-50%); border:2px solid white;"></div>`;
        }

        this.setAnswer(questionId, JSON.stringify(this._hotspotClicks[questionId]));
    },

    setFileAnswer(questionId, input) {
        if (input.files.length) {
            this.setAnswer(questionId, `[file:${input.files[0].name}]`);
            this._fileInputs = this._fileInputs || {};
            this._fileInputs[questionId] = input;
        }
    },

    setAnswer(questionId, value) {
        this.answers[questionId] = value;
        this.updateProgress();
    },

    updateProgress() {
        const count = Object.keys(this.answers).filter(k => this.answers[k]).length;
        const el = $('#answered-count');
        if (el) el.textContent = count;

        $$('.question-card').forEach((card, i) => {
            const qid = card.dataset.qid;
            const navBtn = $(`#qnav-${i}`);
            if (navBtn) {
                navBtn.classList.toggle('answered', !!this.answers[qid]);
            }
        });
    },

    updateWordCount(textarea, maxLimit, minLimit) {
        const words = textarea.value.trim().split(/\s+/).filter(w => w).length;
        const el = $(`#wc-${textarea.dataset.qid}`);
        if (el) {
            let text = `${words} words`;
            if (minLimit) text += ` (min: ${minLimit})`;
            if (maxLimit) text += ` (max: ${maxLimit})`;
            el.textContent = text;
            el.classList.toggle('over-limit', (maxLimit > 0 && words > maxLimit));
            el.classList.toggle('under-limit', (minLimit > 0 && words < minLimit));
        }
    },

    scrollToQuestion(index) {
        const q = $(`#question-${index}`);
        if (q) q.scrollIntoView({ behavior: 'smooth', block: 'center' });
        $$('.question-nav-btn').forEach(b => b.classList.remove('current'));
        const btn = $(`#qnav-${index}`);
        if (btn) btn.classList.add('current');
    },

    startTimer(seconds, examId) {
        let remaining = seconds;
        const display = $('#timer-display');
        const timer = $('#exam-timer');

        this.timerInterval = setInterval(async () => {
            remaining--;
            if (display) display.textContent = formatTimer(remaining);
            if (remaining <= 300 && timer) timer.className = 'exam-timer warning';
            if (remaining <= 60 && timer) timer.className = 'exam-timer danger';
            if (remaining <= 0) {
                clearInterval(this.timerInterval);
                showToast('Time is up! Exam auto-submitted.', 'warning');
                this.forceSubmit(examId);
            }
        }, 1000);
    },

    async submitExam() {
        const answered = Object.keys(this.answers).filter(k => this.answers[k]).length;
        const total = $$('.question-card').length;

        if (answered < total) {
            showConfirm('Submit Exam?',
                `You have answered ${answered} of ${total} questions. Unanswered questions will receive 0 points. Submit anyway?`,
                () => this.doSubmit()
            );
        } else {
            this.doSubmit();
        }
    },

    async doSubmit() {
        clearInterval(this.timerInterval);
        ProctorModule.stop();

        const answersArr = Object.entries(this.answers).map(([qid, text]) => ({
            question_id: parseInt(qid),
            answer_text: text
        }));

        const data = await apiPost(`/exams/${this.currentAttempt.exam_id}/submit`, {
            attempt_id: this.currentAttempt.id,
            answers: answersArr
        });

        document.body.classList.remove('lockdown-active');

        if (data.error) { showToast(data.error, 'error'); return; }

        setHTML('#page-content', `
            <div class="fade-in" style="max-width:500px; margin:60px auto; text-align:center;">
                <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="var(--success)" stroke-width="2" style="margin:0 auto 20px;">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <h1 style="margin-bottom:8px;">Exam Submitted!</h1>
                ${data.attempt?.total_score !== undefined && data.attempt?.total_score !== null ? `
                    <p style="font-size:1.25rem; margin-bottom:8px;">Your score: <strong>${data.attempt.total_score}</strong></p>
                    ${data.attempt.status === 'submitted' ? '<p class="text-warning" style="font-size:0.9rem;">Some questions are awaiting manual grading.</p>' : '<span class="tag tag-success">Auto-Marked</span>'}
                ` : '<p class="text-secondary mb-2">Your exam has been submitted for grading.</p>'}
                <div class="mt-3">
                    <a href="#/dashboard" class="btn btn-primary">Back to Dashboard</a>
                </div>
            </div>
        `);
    },

    async forceSubmit(examId) {
        clearInterval(this.timerInterval);
        ProctorModule.stop();
        this.doSubmit();
    },

    // ===== CREATION FORM =====
    showCreateForm(courseId) {
        showModal('Create Exam / Quiz', `
            <form>
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" id="exam-title" class="form-control" required>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="exam-desc" class="form-control" rows="2"></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Type</label>
                        <select id="exam-type" class="form-control">
                            <option value="quiz">Quiz</option>
                            <option value="midterm">Midterm</option>
                            <option value="final">Final</option>
                            <option value="practice">Practice</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Duration (minutes)</label>
                        <input type="number" id="exam-duration" class="form-control" value="30" min="1">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Total Points</label>
                        <input type="number" id="exam-points" class="form-control" value="100">
                    </div>
                    <div class="form-group">
                        <label>Max Attempts</label>
                        <select id="exam-attempts" class="form-control">
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="5">5</option>
                            <option value="99">Unlimited</option>
                        </select>
                    </div>
                </div>
                <div class="form-group" id="grade-recording-group" style="display:none;">
                    <label>Grade Recording</label>
                    <select id="exam-grade-recording" class="form-control">
                        <option value="best">Best Attempt</option>
                        <option value="last">Last Attempt</option>
                        <option value="average">Average of All</option>
                    </select>
                </div>
                <h4 style="margin:16px 0 8px; font-size:0.9rem;">Availability Window</h4>
                <div class="form-row">
                    <div class="form-group">
                        <label>Available From</label>
                        <input type="datetime-local" id="exam-start" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Available Until (Deadline)</label>
                        <input type="datetime-local" id="exam-end" class="form-control">
                    </div>
                </div>
                <h4 style="margin:16px 0 8px; font-size:0.9rem;">Security & Proctoring</h4>
                <div class="form-group">
                    <label class="form-check"><input type="checkbox" id="exam-lockdown"> Enable Lockdown Browser</label>
                </div>
                <div class="form-group">
                    <label class="form-check"><input type="checkbox" id="exam-proctor"> Enable Proctoring</label>
                </div>
                <div class="form-group">
                    <label class="form-check"><input type="checkbox" id="exam-webcam"> Require Webcam</label>
                </div>
                <div class="form-group">
                    <label class="form-check"><input type="checkbox" id="exam-tab" checked> Detect Tab Switches</label>
                </div>
                <div class="form-group">
                    <label class="form-check"><input type="checkbox" id="exam-shuffle" checked> Shuffle Questions</label>
                </div>
            </form>
            <script>
                document.getElementById('exam-attempts').addEventListener('change', function() {
                    document.getElementById('grade-recording-group').style.display = this.value > 1 ? 'block' : 'none';
                });
            </script>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="ExamsModule.create(${courseId})">Create Exam</button>
        `, { wide: true });
    },

    async create(courseId) {
        const startVal = $('#exam-start').value;
        const endVal = $('#exam-end').value;
        const data = await apiPost(`/exams/course/${courseId}`, {
            title: $('#exam-title').value.trim(),
            description: $('#exam-desc').value.trim(),
            exam_type: $('#exam-type').value,
            duration_minutes: parseInt($('#exam-duration').value),
            total_points: parseFloat($('#exam-points').value),
            max_attempts: parseInt($('#exam-attempts').value),
            grade_recording: $('#exam-grade-recording').value,
            start_window: startVal ? new Date(startVal).toISOString().replace('T', ' ').slice(0, 19) : null,
            end_window: endVal ? new Date(endVal).toISOString().replace('T', ' ').slice(0, 19) : null,
            lockdown_browser: $('#exam-lockdown').checked ? 1 : 0,
            proctor_enabled: $('#exam-proctor').checked ? 1 : 0,
            require_webcam: $('#exam-webcam').checked ? 1 : 0,
            detect_tab_switch: $('#exam-tab').checked ? 1 : 0,
            shuffle_questions: $('#exam-shuffle').checked ? 1 : 0,
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Exam created! Add questions then publish.', 'success');
        this.manageQuestions(data.exam.id);
    },

    showEditForm(examId, courseId) {
        apiGet(`/exams/${examId}/questions`).then(() => {
            // Just need the exam data from the list
        });
        showModal('Edit Exam Settings', '<div class="loading-page"><div class="loading-spinner"></div></div>');
        // Load current exam data through results endpoint or update endpoint
        apiPut(`/exams/${examId}`, {}).then(data => {
            const e = data.exam;
            setHTML('#modal-body', `
                <form>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Max Attempts</label>
                            <select id="edit-exam-attempts" class="form-control">
                                ${[1,2,3,5,99].map(v => `<option value="${v}" ${e.max_attempts == v ? 'selected' : ''}>${v === 99 ? 'Unlimited' : v}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Grade Recording</label>
                            <select id="edit-exam-grade" class="form-control">
                                ${['best','last','average'].map(v => `<option value="${v}" ${(e.grade_recording||'best') == v ? 'selected' : ''}>${v.charAt(0).toUpperCase()+v.slice(1)}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Available From</label>
                            <input type="datetime-local" id="edit-exam-start" class="form-control" value="${e.start_window ? e.start_window.replace(' ', 'T').slice(0,16) : ''}">
                        </div>
                        <div class="form-group">
                            <label>Available Until</label>
                            <input type="datetime-local" id="edit-exam-end" class="form-control" value="${e.end_window ? e.end_window.replace(' ', 'T').slice(0,16) : ''}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Duration (min)</label>
                        <input type="number" id="edit-exam-dur" class="form-control" value="${e.duration_minutes}">
                    </div>
                    <h4 style="margin:12px 0 8px; font-size:0.9rem;">Security</h4>
                    <div class="form-group"><label class="form-check"><input type="checkbox" id="edit-exam-lockdown" ${e.lockdown_browser ? 'checked' : ''}> Lockdown Browser</label></div>
                    <div class="form-group"><label class="form-check"><input type="checkbox" id="edit-exam-proctor" ${e.proctor_enabled ? 'checked' : ''}> Proctoring</label></div>
                    <div class="form-group"><label class="form-check"><input type="checkbox" id="edit-exam-webcam" ${e.require_webcam ? 'checked' : ''}> Require Webcam</label></div>
                </form>
            `);
            setHTML('#modal-footer', `
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn btn-primary" onclick="ExamsModule.updateExam(${examId}, ${courseId})">Save</button>
            `);
        });
    },

    async updateExam(examId, courseId) {
        const startVal = $('#edit-exam-start').value;
        const endVal = $('#edit-exam-end').value;
        const data = await apiPut(`/exams/${examId}`, {
            max_attempts: parseInt($('#edit-exam-attempts').value),
            grade_recording: $('#edit-exam-grade').value,
            start_window: startVal ? new Date(startVal).toISOString().replace('T', ' ').slice(0, 19) : null,
            end_window: endVal ? new Date(endVal).toISOString().replace('T', ' ').slice(0, 19) : null,
            duration_minutes: parseInt($('#edit-exam-dur').value),
            lockdown_browser: $('#edit-exam-lockdown').checked ? 1 : 0,
            proctor_enabled: $('#edit-exam-proctor').checked ? 1 : 0,
            require_webcam: $('#edit-exam-webcam').checked ? 1 : 0,
        });
        if (data.error) { showToast(data.error, 'error'); return; }
        closeModal();
        showToast('Exam updated!', 'success');
        this.renderForCourse(courseId);
    },

    // ===== QUESTION MANAGEMENT =====
    async manageQuestions(examId) {
        const data = await apiGet(`/exams/${examId}/questions`);
        const questions = data.questions || [];

        showModal('Manage Questions', `
            <div id="questions-list">
                ${questions.map((q, i) => `
                    <div class="question-builder">
                        <div class="question-builder-header" style="display:flex; justify-content:space-between; align-items:center;">
                            <span><strong>Q${i + 1}.</strong> ${escapeHtml(q.question_text).substring(0, 60)}${q.question_text.length > 60 ? '...' : ''}</span>
                            <div class="flex gap-1 items-center">
                                <span class="tag tag-info">${this.getTypeLabel(q.question_type)}</span>
                                <span class="tag tag-secondary">${q.points} pts</span>
                                <button class="btn btn-ghost btn-sm text-danger" onclick="ExamsModule.deleteQuestion(${q.id}, ${examId})">x</button>
                            </div>
                        </div>
                    </div>
                `).join('')}
                ${!questions.length ? '<p class="text-center text-muted">No questions yet</p>' : ''}
            </div>
            <hr style="margin:16px 0;">
            <h4 style="margin-bottom:12px;">Add Question</h4>
            <div class="form-group">
                <label>Type</label>
                <select id="q-type" class="form-control" onchange="ExamsModule.toggleQuestionOptions(this.value)">
                    <option value="mcq">MCQ (Single Answer)</option>
                    <option value="multiple_answer">Multiple Answer (Select All)</option>
                    <option value="true_false">True / False</option>
                    <option value="fill_blank">Fill in the Blank</option>
                    <option value="matching">Matching</option>
                    <option value="ordering">Ordering / Sequencing</option>
                    <option value="short_answer">Short Answer</option>
                    <option value="essay">Essay / Long Answer</option>
                    <option value="numeric">Numeric Answer</option>
                    <option value="file_upload">File Upload</option>
                </select>
            </div>
            <div class="form-group">
                <label>Question Text</label>
                <textarea id="q-text" class="form-control" rows="2"></textarea>
            </div>
            <div class="form-group">
                <label>Points</label>
                <input type="number" id="q-points" class="form-control" value="5">
            </div>
            <div class="form-group">
                <label>Image (optional URL/path)</label>
                <input type="text" id="q-image" class="form-control" placeholder="e.g. uploads/question1.png">
            </div>
            <!-- MCQ / Multiple Answer options -->
            <div id="mcq-options-area">
                <div class="form-group">
                    <label>Options (one per line)</label>
                    <textarea id="q-options" class="form-control" rows="4" placeholder="Option A\nOption B\nOption C\nOption D"></textarea>
                </div>
                <div class="form-group" id="single-correct-area">
                    <label>Correct Answer</label>
                    <input type="text" id="q-correct" class="form-control" placeholder="Must match one option exactly">
                </div>
                <div id="multi-correct-area" style="display:none;">
                    <div class="form-group">
                        <label>Correct Answers (one per line)</label>
                        <textarea id="q-correct-multi" class="form-control" rows="3" placeholder="Option A\nOption C"></textarea>
                    </div>
                    <label class="form-check"><input type="checkbox" id="q-partial-credit"> Allow partial credit</label>
                </div>
            </div>
            <!-- Fill in blank -->
            <div id="fill-blank-area" style="display:none;">
                <div class="form-group">
                    <label>Accepted Answers (one per line)</label>
                    <textarea id="q-accepted" class="form-control" rows="3" placeholder="answer1\nanswer variant\nanother variant"></textarea>
                </div>
                <label class="form-check"><input type="checkbox" id="q-case-sensitive"> Case sensitive</label>
            </div>
            <!-- Matching -->
            <div id="matching-area" style="display:none;">
                <div class="form-group">
                    <label>Matching Pairs (Left = Right, one per line)</label>
                    <textarea id="q-matching" class="form-control" rows="4" placeholder="Capital of France = Paris\nCapital of Japan = Tokyo\nCapital of Egypt = Cairo"></textarea>
                </div>
            </div>
            <!-- Ordering -->
            <div id="ordering-area" style="display:none;">
                <div class="form-group">
                    <label>Items in Correct Order (one per line)</label>
                    <textarea id="q-ordering" class="form-control" rows="4" placeholder="First step\nSecond step\nThird step\nFourth step"></textarea>
                </div>
            </div>
            <!-- Numeric -->
            <div id="numeric-area" style="display:none;">
                <div class="form-row">
                    <div class="form-group">
                        <label>Correct Answer</label>
                        <input type="number" step="any" id="q-numeric" class="form-control" placeholder="e.g. 9.8">
                    </div>
                    <div class="form-group">
                        <label>Tolerance (+/-)</label>
                        <input type="number" step="any" id="q-tolerance" class="form-control" value="0" placeholder="e.g. 0.2">
                    </div>
                </div>
            </div>
            <!-- Short answer -->
            <div id="short-answer-area" style="display:none;">
                <div class="form-group">
                    <label>Keywords for AI draft scoring (comma separated)</label>
                    <input type="text" id="q-keywords" class="form-control" placeholder="keyword1, keyword2, key concept">
                </div>
                <div class="form-group">
                    <label>Model Answer (for reference)</label>
                    <textarea id="q-model-answer" class="form-control" rows="2" placeholder="The expected answer..."></textarea>
                </div>
            </div>
            <!-- Essay -->
            <div id="essay-area" style="display:none;">
                <div class="form-row">
                    <div class="form-group">
                        <label>Min Words</label>
                        <input type="number" id="q-word-min" class="form-control" value="0">
                    </div>
                    <div class="form-group">
                        <label>Max Words</label>
                        <input type="number" id="q-word-max" class="form-control" value="0" placeholder="0 = no limit">
                    </div>
                </div>
                <div class="form-group">
                    <label>Rubric</label>
                    <textarea id="q-rubric" class="form-control" rows="3" placeholder="Grading criteria..."></textarea>
                </div>
            </div>
            <!-- File upload -->
            <div id="file-upload-area" style="display:none;">
                <div class="form-group">
                    <label>Allowed File Types</label>
                    <input type="text" id="q-file-types" class="form-control" placeholder=".pdf,.docx,.zip">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Done</button>
            <button class="btn btn-primary" onclick="ExamsModule.addQuestion(${examId})">Add Question</button>
        `, { wide: true });
    },

    toggleQuestionOptions(type) {
        // Hide all type-specific areas
        ['mcq-options-area', 'fill-blank-area', 'matching-area', 'ordering-area',
         'numeric-area', 'short-answer-area', 'essay-area', 'file-upload-area'].forEach(id => {
            const el = $(`#${id}`);
            if (el) el.style.display = 'none';
        });

        // Show relevant area
        const showMap = {
            mcq: 'mcq-options-area', multiple_answer: 'mcq-options-area',
            true_false: null, fill_blank: 'fill-blank-area',
            matching: 'matching-area', ordering: 'ordering-area',
            numeric: 'numeric-area', short_answer: 'short-answer-area',
            essay: 'essay-area', file_upload: 'file-upload-area',
            image_mcq: 'mcq-options-area', hotspot: null
        };

        const areaId = showMap[type];
        if (areaId) {
            const el = $(`#${areaId}`);
            if (el) el.style.display = 'block';
        }

        // Toggle single vs multi correct for MCQ types
        const singleArea = $('#single-correct-area');
        const multiArea = $('#multi-correct-area');
        if (singleArea) singleArea.style.display = type === 'multiple_answer' ? 'none' : 'block';
        if (multiArea) multiArea.style.display = type === 'multiple_answer' ? 'block' : 'none';
    },

    async addQuestion(examId) {
        const type = $('#q-type').value;
        const questionData = {
            question_type: type,
            question_text: $('#q-text').value.trim(),
            points: parseFloat($('#q-points').value),
            image_path: $('#q-image')?.value?.trim() || null,
        };

        if (type === 'mcq' || type === 'image_mcq') {
            questionData.options = $('#q-options').value.split('\n').filter(o => o.trim());
            questionData.correct_answer = $('#q-correct')?.value?.trim() || null;
        } else if (type === 'multiple_answer') {
            questionData.options = $('#q-options').value.split('\n').filter(o => o.trim());
            questionData.correct_answers = ($('#q-correct-multi')?.value || '').split('\n').filter(o => o.trim());
            questionData.partial_credit = $('#q-partial-credit')?.checked ? 1 : 0;
        } else if (type === 'true_false') {
            questionData.options = ['True', 'False'];
            questionData.correct_answer = $('#q-correct')?.value?.trim() || null;
        } else if (type === 'fill_blank') {
            questionData.accepted_answers = ($('#q-accepted')?.value || '').split('\n').filter(o => o.trim());
            questionData.case_sensitive = $('#q-case-sensitive')?.checked ? 1 : 0;
        } else if (type === 'matching') {
            const lines = ($('#q-matching')?.value || '').split('\n').filter(l => l.includes('='));
            questionData.matching_pairs = lines.map(l => {
                const [left, right] = l.split('=').map(s => s.trim());
                return { left, right };
            });
        } else if (type === 'ordering') {
            questionData.ordering_items = ($('#q-ordering')?.value || '').split('\n').filter(o => o.trim());
        } else if (type === 'numeric') {
            questionData.numeric_answer = parseFloat($('#q-numeric')?.value) || 0;
            questionData.numeric_tolerance = parseFloat($('#q-tolerance')?.value) || 0;
        } else if (type === 'short_answer') {
            const kw = $('#q-keywords')?.value || '';
            questionData.keywords = kw.split(',').map(k => k.trim()).filter(k => k);
            questionData.correct_answer = $('#q-model-answer')?.value?.trim() || null;
        } else if (type === 'essay') {
            questionData.word_limit_min = parseInt($('#q-word-min')?.value) || 0;
            questionData.word_limit = parseInt($('#q-word-max')?.value) || 0;
            questionData.rubric = $('#q-rubric')?.value?.trim() || '';
        } else if (type === 'file_upload') {
            questionData.allowed_file_types = $('#q-file-types')?.value?.trim() || null;
        }

        const data = await apiPost(`/exams/${examId}/questions`, questionData);
        if (data.error) { showToast(data.error, 'error'); return; }
        showToast('Question added!', 'success');
        this.manageQuestions(examId);
    },

    async deleteQuestion(questionId, examId) {
        showConfirm('Delete Question', 'Delete this question?', async () => {
            await apiDelete(`/exams/questions/${questionId}`);
            showToast('Question deleted', 'success');
            this.manageQuestions(examId);
        });
    },

    async publish(examId, courseId) {
        const data = await apiPost(`/exams/${examId}/publish`, {});
        if (data.error) { showToast(data.error, 'error'); return; }
        showToast('Exam published!', 'success');
        this.renderForCourse(courseId);
    },

    async viewResults(examId) {
        const data = await apiGet(`/exams/${examId}/results`);
        if (data.error) { showToast(data.error, 'error'); return; }

        showModal('Exam Results', `
            ${data.attempts.length ? `
                <div class="table-container">
                    <table>
                        <thead><tr>
                            <th>Student</th><th>Attempt</th><th>Score</th><th>Status</th>
                            <th>Violations</th><th>Submitted</th><th>Actions</th>
                        </tr></thead>
                        <tbody>
                            ${data.attempts.map(a => `
                                <tr>
                                    <td>${escapeHtml(a.first_name)} ${escapeHtml(a.last_name)}</td>
                                    <td>#${a.attempt_number || 1}</td>
                                    <td><strong>${a.total_score !== null ? a.total_score : '-'}</strong></td>
                                    <td>
                                        <span class="tag tag-${a.status === 'graded' ? 'success' : a.status === 'flagged' ? 'danger' : 'warning'}">${a.status}</span>
                                        ${a.auto_submitted ? '<span class="tag tag-danger">Auto</span>' : ''}
                                    </td>
                                    <td>${a.violation_count || 0}</td>
                                    <td style="font-size:0.8rem;">${a.submitted_at ? formatDateTime(a.submitted_at) : '-'}</td>
                                    <td>
                                        <button class="btn btn-sm btn-outline" onclick="ExamsModule.viewAttemptDetail(${a.id})">Review</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : '<div class="empty-state"><p>No attempts yet</p></div>'}
        `, '<button class="btn btn-secondary" onclick="closeModal()">Close</button>', { wide: true });
    },

    async viewAttemptDetail(attemptId) {
        const attempt = await apiGet(`/exams/attempts/${attemptId}/time`); // Just to validate
        // Fetch full results
        const allResults = await apiGet(`/exams/${attemptId}/results`); // This won't work directly
        // For now show a simple grading interface
        showToast('Opening attempt review...', 'info');
    }
};
