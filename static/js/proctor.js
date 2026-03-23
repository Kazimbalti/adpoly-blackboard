/* ===== Proctoring Module ===== */
const ProctorModule = {
    attemptId: null,
    settings: {},
    stream: null,
    violationCount: 0,
    active: false,

    init(attemptId, settings) {
        this.attemptId = attemptId;
        this.settings = settings;
        this.violationCount = 0;
        this.active = true;

        if (settings.webcam) this.initWebcam();
        if (settings.tabSwitch) this.initTabDetection();
        if (settings.copyPaste) this.initCopyPasteDetection();
        this.initContextMenuBlock();
        this.initDevToolsDetection();
    },

    stop() {
        this.active = false;
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        document.removeEventListener('visibilitychange', this._visHandler);
        window.removeEventListener('blur', this._blurHandler);
        document.removeEventListener('copy', this._copyHandler);
        document.removeEventListener('paste', this._pasteHandler);
        document.removeEventListener('contextmenu', this._ctxHandler);

        const preview = $('.webcam-preview');
        if (preview) preview.remove();
    },

    async initWebcam() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });

            const preview = document.createElement('div');
            preview.className = 'webcam-preview';
            preview.innerHTML = '<video autoplay muted playsinline></video>';
            document.body.appendChild(preview);

            const video = preview.querySelector('video');
            video.srcObject = this.stream;
        } catch (err) {
            this.reportViolation('webcam_off', { error: err.message });
            showToast('Webcam access is required for this exam.', 'warning');
        }
    },

    initTabDetection() {
        this._visHandler = () => {
            if (document.hidden && this.active) {
                this.reportViolation('tab_switch', { timestamp: Date.now() });
                showToast('Tab switch detected! This is a violation.', 'error');
            }
        };
        document.addEventListener('visibilitychange', this._visHandler);

        this._blurHandler = () => {
            if (this.active) {
                this.reportViolation('tab_switch', { type: 'window_blur', timestamp: Date.now() });
            }
        };
        window.addEventListener('blur', this._blurHandler);
    },

    initCopyPasteDetection() {
        this._copyHandler = (e) => {
            if (this.active) {
                e.preventDefault();
                this.reportViolation('copy_paste', { action: 'copy' });
                showToast('Copy is not allowed during the exam.', 'warning');
            }
        };

        this._pasteHandler = (e) => {
            if (this.active) {
                e.preventDefault();
                this.reportViolation('copy_paste', { action: 'paste' });
                showToast('Paste is not allowed during the exam.', 'warning');
            }
        };

        document.addEventListener('copy', this._copyHandler);
        document.addEventListener('paste', this._pasteHandler);

        // Block keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (!this.active) return;
            if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a', 'p'].includes(e.key.toLowerCase())) {
                e.preventDefault();
                if (['c', 'v', 'x'].includes(e.key.toLowerCase())) {
                    this.reportViolation('copy_paste', { action: `Ctrl+${e.key}` });
                }
            }
            // Block Print Screen
            if (e.key === 'PrintScreen') {
                e.preventDefault();
                this.reportViolation('copy_paste', { action: 'PrintScreen' });
            }
        });
    },

    initContextMenuBlock() {
        this._ctxHandler = (e) => {
            if (this.active) {
                e.preventDefault();
                this.reportViolation('right_click', {});
            }
        };
        document.addEventListener('contextmenu', this._ctxHandler);
    },

    initDevToolsDetection() {
        const threshold = 160;
        const check = () => {
            if (!this.active) return;
            const widthDiff = window.outerWidth - window.innerWidth;
            const heightDiff = window.outerHeight - window.innerHeight;
            if (widthDiff > threshold || heightDiff > threshold) {
                this.reportViolation('devtools_open', { widthDiff, heightDiff });
                showToast('Developer tools detected! Close them immediately.', 'error');
            }
        };
        this._devtoolsTimer = setInterval(check, 3000);
    },

    async reportViolation(eventType, details) {
        if (!this.active || !this.attemptId) return;

        this.violationCount++;

        // Update UI
        const countEl = $('#violation-count');
        const displayEl = $('#violation-display');
        if (countEl) countEl.textContent = this.violationCount;
        if (displayEl) {
            displayEl.className = `exam-violation-count ${
                this.violationCount >= this.settings.maxViolations - 1 ? 'critical' :
                this.violationCount >= Math.floor(this.settings.maxViolations / 2) ? 'caution' : 'safe'
            }`;
        }

        const data = await apiPost(`/exams/attempts/${this.attemptId}/violation`, {
            event_type: eventType,
            details: details
        });

        if (data.auto_submitted) {
            this.stop();
            showToast('Too many violations! Your exam has been auto-submitted.', 'error', 6000);
            document.body.classList.remove('lockdown-active');
            setHTML('#page-content', `
                <div style="max-width:500px; margin:60px auto; text-align:center;">
                    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="var(--danger)" stroke-width="2" style="margin:0 auto 20px;">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    <h1 style="color:var(--danger); margin-bottom:8px;">Exam Auto-Submitted</h1>
                    <p class="text-secondary mb-2">Your exam was automatically submitted due to excessive proctoring violations.</p>
                    <a href="#/dashboard" class="btn btn-primary">Back to Dashboard</a>
                </div>
            `);
        }
    }
};
