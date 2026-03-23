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

        setHTML('#course-tab-content', `
            <div class="fade-in">
                ${isFaculty ? `
                    <div class="mb-2">
                        <button class="btn btn-primary btn-sm" onclick="ExamsModule.showCreateForm(${courseId})">+ Create Exam</button>
                    </div>
                ` : ''}
                ${data.exams.length ? data.exams.map(e => {
                    const hasAttempt = e.attempt;
                    return `
                    <div class="card mb-2">
                        <div class="card-body">
                            <div class="flex justify-between items-center flex-wrap gap-1">
                                <div>
                                    <h3 style="font-size:1.05rem; font-weight:600;">${escapeHtml(e.title)}</h3>
                                    <div class="flex gap-2 mt-1" style="font-size:0.8rem; color:var(--text-muted);">
                                        <span class="tag tag-${e.exam_type === 'quiz' ? 'info' : e.exam_type === 'midterm' ? 'warning' : 'danger'}">${e.exam_type}</span>
                                        <span>${e.duration_minutes} minutes</span>
                                        <span>${e.total_points} points</span>
                                        ${e.proctor_enabled ? '<span class="tag tag-danger">Proctored</span>' : ''}
                                    </div>
                                </div>
                                <div class="flex gap-1">
                                    ${!isFaculty && !hasAttempt ? `
                                        <button class="btn btn-primary btn-sm" onclick="ExamsModule.startExam(${e.id})">Start Exam</button>
                                    ` : ''}
                                    ${!isFaculty && hasAttempt ? `
                                        ${hasAttempt.status === 'in_progress' ? `
                                            <button class="btn btn-warning btn-sm" onclick="ExamsModule.resumeExam(${e.id})">Resume</button>
                                        ` : `
                                            <span class="tag tag-success">Score: ${hasAttempt.total_score !== null ? hasAttempt.total_score + '/' + e.total_points : 'Pending'}</span>
                                        `}
                                    ` : ''}
                                    ${isFaculty ? `
                                        <button class="btn btn-outline btn-sm" onclick="ExamsModule.viewResults(${e.id})">Results (${e.attempt_count || 0})</button>
                                        <button class="btn btn-sm btn-secondary" onclick="ExamsModule.manageQuestions(${e.id})">Questions</button>
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

        // Hide sidebar, enter lockdown
        if (exam.lockdown_browser) document.body.classList.add('lockdown-active');

        // Initialize proctoring
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

        if (q.question_type === 'mcq' || q.question_type === 'true_false') {
            const options = q.options || (q.question_type === 'true_false' ? ['True', 'False'] : []);
            answerHtml = `
                <div class="mcq-options">
                    ${options.map((opt, oi) => `
                        <div class="mcq-option" onclick="ExamsModule.selectOption(${q.id}, '${escapeHtml(opt)}', this)" data-qid="${q.id}">
                            <div class="mcq-radio"></div>
                            <span>${escapeHtml(opt)}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (q.question_type === 'short_answer') {
            answerHtml = `
                <input type="text" class="form-control" placeholder="Enter your answer"
                    oninput="ExamsModule.setAnswer(${q.id}, this.value)" data-qid="${q.id}">
            `;
        } else if (q.question_type === 'essay') {
            answerHtml = `
                <div class="essay-answer">
                    <textarea class="form-control" rows="6" placeholder="Write your essay answer..."
                        oninput="ExamsModule.setAnswer(${q.id}, this.value); ExamsModule.updateWordCount(this, ${q.word_limit || 0})"
                        data-qid="${q.id}"></textarea>
                    ${q.word_limit ? `<div class="word-count" id="wc-${q.id}">0 / ${q.word_limit} words</div>` : ''}
                </div>
            `;
        }

        return `
            <div class="question-card" id="question-${index}" data-qid="${q.id}">
                <div class="question-number">
                    <span>Question ${index + 1}</span>
                    <span class="question-points">${q.points} points</span>
                </div>
                <div class="question-text">${q.question_text}</div>
                ${answerHtml}
            </div>
        `;
    },

    selectOption(questionId, value, elem) {
        $$(`[data-qid="${questionId}"].mcq-option`).forEach(o => o.classList.remove('selected'));
        elem.classList.add('selected');
        this.setAnswer(questionId, value);
    },

    setAnswer(questionId, value) {
        this.answers[questionId] = value;
        this.updateProgress();
    },

    updateProgress() {
        const count = Object.keys(this.answers).filter(k => this.answers[k]).length;
        const el = $('#answered-count');
        if (el) el.textContent = count;

        // Update nav buttons
        $$('.question-card').forEach((card, i) => {
            const qid = card.dataset.qid;
            const navBtn = $(`#qnav-${i}`);
            if (navBtn) {
                navBtn.classList.toggle('answered', !!this.answers[qid]);
            }
        });
    },

    updateWordCount(textarea, limit) {
        const words = textarea.value.trim().split(/\s+/).filter(w => w).length;
        const el = $(`#wc-${textarea.dataset.qid}`);
        if (el) {
            el.textContent = `${words} / ${limit} words`;
            el.classList.toggle('over-limit', limit > 0 && words > limit);
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
                ${data.attempt?.total_score !== undefined ? `
                    <p style="font-size:1.25rem; margin-bottom:24px;">Your score: <strong>${data.attempt.total_score}</strong></p>
                ` : '<p class="text-secondary mb-2">Your exam has been submitted for grading.</p>'}
                <a href="#/dashboard" class="btn btn-primary">Back to Dashboard</a>
            </div>
        `);
    },

    async forceSubmit(examId) {
        clearInterval(this.timerInterval);
        ProctorModule.stop();
        this.doSubmit();
    },

    showCreateForm(courseId) {
        showModal('Create Exam', `
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
                        <input type="number" id="exam-attempts" class="form-control" value="1" min="1">
                    </div>
                </div>
                <h4 style="margin:16px 0 8px; font-size:0.9rem;">Proctoring Settings</h4>
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
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="ExamsModule.create(${courseId})">Create Exam</button>
        `, { wide: true });
    },

    async create(courseId) {
        const data = await apiPost(`/exams/course/${courseId}`, {
            title: $('#exam-title').value.trim(),
            description: $('#exam-desc').value.trim(),
            exam_type: $('#exam-type').value,
            duration_minutes: parseInt($('#exam-duration').value),
            total_points: parseFloat($('#exam-points').value),
            max_attempts: parseInt($('#exam-attempts').value),
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

    async manageQuestions(examId) {
        const data = await apiGet(`/exams/${examId}/questions`);
        const questions = data.questions || [];

        showModal('Manage Questions', `
            <div id="questions-list">
                ${questions.map((q, i) => `
                    <div class="question-builder">
                        <div class="question-builder-header">
                            <span><strong>Q${i + 1}.</strong> ${escapeHtml(q.question_text).substring(0, 50)}...</span>
                            <span class="tag tag-info">${q.question_type} | ${q.points} pts</span>
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
                    <option value="mcq">Multiple Choice</option>
                    <option value="true_false">True/False</option>
                    <option value="short_answer">Short Answer</option>
                    <option value="essay">Essay</option>
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
            <div id="mcq-options-area">
                <div class="form-group">
                    <label>Options (one per line)</label>
                    <textarea id="q-options" class="form-control" rows="4" placeholder="Option A\nOption B\nOption C\nOption D"></textarea>
                </div>
                <div class="form-group">
                    <label>Correct Answer</label>
                    <input type="text" id="q-correct" class="form-control" placeholder="Must match one option exactly">
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="closeModal()">Done</button>
            <button class="btn btn-primary" onclick="ExamsModule.addQuestion(${examId})">Add Question</button>
        `, { wide: true });
    },

    toggleQuestionOptions(type) {
        const area = $('#mcq-options-area');
        if (area) area.style.display = (type === 'essay') ? 'none' : 'block';
    },

    async addQuestion(examId) {
        const type = $('#q-type').value;
        const options = type === 'mcq' ? $('#q-options').value.split('\n').filter(o => o.trim()) :
                        type === 'true_false' ? ['True', 'False'] : null;

        const data = await apiPost(`/exams/${examId}/questions`, {
            question_type: type,
            question_text: $('#q-text').value.trim(),
            points: parseFloat($('#q-points').value),
            options: options,
            correct_answer: $('#q-correct')?.value?.trim() || null,
        });

        if (data.error) { showToast(data.error, 'error'); return; }
        showToast('Question added!', 'success');
        this.manageQuestions(examId);
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
                        <thead><tr><th>Student</th><th>Score</th><th>Status</th><th>Violations</th><th>Submitted</th></tr></thead>
                        <tbody>
                            ${data.attempts.map(a => `
                                <tr>
                                    <td>${escapeHtml(a.first_name)} ${escapeHtml(a.last_name)}</td>
                                    <td><strong>${a.total_score !== null ? a.total_score : '-'}</strong></td>
                                    <td><span class="tag tag-${a.status === 'graded' ? 'success' : a.status === 'flagged' ? 'danger' : 'warning'}">${a.status}</span></td>
                                    <td>${a.violation_count || 0} ${a.auto_submitted ? '<span class="tag tag-danger">Auto-submit</span>' : ''}</td>
                                    <td>${a.submitted_at ? formatDateTime(a.submitted_at) : '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : '<div class="empty-state"><p>No attempts yet</p></div>'}
        `, '<button class="btn btn-secondary" onclick="closeModal()">Close</button>', { wide: true });
    }
};
