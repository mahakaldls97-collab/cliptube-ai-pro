const API_BASE = window.location.origin;

// DOM Elements
const generateBtn = document.getElementById('generateBtn');
const btnText = document.getElementById('btnText');
const btnSpinner = document.getElementById('btnSpinner');
const urlInput = document.getElementById('youtubeUrl');
const statusSection = document.getElementById('statusSection');
const statusIcon = document.getElementById('statusIcon');
const statusTitle = document.getElementById('statusTitle');
const statusMsg = document.getElementById('statusMsg');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultsSection = document.getElementById('resultsSection');
const resultsGrid = document.getElementById('resultsGrid');
const resultsSubtitle = document.getElementById('resultsSubtitle');
const clipsSlider = document.getElementById('clipsSlider');
const clipsValueDisplay = document.getElementById('clipsValueDisplay');
const presetBtns = document.querySelectorAll('.preset-btn');
const autoCaptions = document.getElementById('autoCaptions');
const bgMusic = document.getElementById('bgMusic');
const smartFace = document.getElementById('smartFace');

let pollInterval = null;
let renderedCount = 0;
let selectedClips = 15;

// ─── SLIDER LOGIC ───────────────────────────────────────
clipsSlider.addEventListener('input', () => {
    selectedClips = parseInt(clipsSlider.value);
    clipsValueDisplay.textContent = selectedClips;
    // Deactivate all presets
    presetBtns.forEach(b => b.classList.remove('active'));
    // Highlight matching preset if any
    presetBtns.forEach(b => {
        if (parseInt(b.dataset.val) === selectedClips) b.classList.add('active');
    });
});

// ─── PRESET BUTTONS ───────────────────────────────────
presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        selectedClips = parseInt(btn.dataset.val);
        clipsSlider.value = selectedClips;
        clipsValueDisplay.textContent = selectedClips;
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});


// ─── GENERATE BUTTON ────────────────────────────────────────────────
generateBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
        urlInput.style.borderColor = '#FF4B2B';
        urlInput.placeholder = '❌ Pehle YouTube link paste karo!';
        return;
    }

    // Reset
    urlInput.style.borderColor = '';
    resultsSection.style.display = 'none';
    resultsGrid.innerHTML = '';
    renderedCount = 0;
    setLoading(true);
    showStatus('⏳', 'Shuru ho raha hai...', 'YouTube se video info le raha hoon...');

    try {
        const options = {
            captions: autoCaptions.checked,
            bgMusic: bgMusic.checked,
            smartFace: smartFace.checked
        };

        const res = await fetch(`${API_BASE}/api/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, numClips: selectedClips, options })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');

        startPolling(data.jobId);
    } catch (err) {
        alert('❌ Error: ' + err.message);
        setLoading(false);
        statusSection.style.display = 'none';
    }
});

// ─── LOADING STATE ──────────────────────────────────────────────────
function setLoading(val) {
    generateBtn.disabled = val;
    btnText.textContent = val ? 'Processing...' : '✂️ Generate Shorts';
    btnSpinner.style.display = val ? 'block' : 'none';
}

// ─── STATUS CARD ────────────────────────────────────────────────────
function showStatus(icon, title, msg) {
    statusSection.style.display = 'block';
    if (icon) statusIcon.textContent = icon;
    if (title) statusTitle.textContent = title;
    if (msg) statusMsg.textContent = msg;
}

// ─── POLLING ────────────────────────────────────────────────────────
function startPolling(jobId) {
    clearInterval(pollInterval);

    pollInterval = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/status/${jobId}`);
            const job = await res.json();

            updateStatus(job);

            // Live render — append newly generated clips immediately
            if (job.clips && job.clips.length > renderedCount) {
                const newClips = job.clips.slice(renderedCount);
                newClips.forEach(clip => appendClipCard(clip));
                renderedCount = job.clips.length;

                // Show results section as soon as first clip arrives
                if (renderedCount === 1) {
                    resultsSection.style.display = 'block';
                    resultsSubtitle.textContent = `"${job.title}"`;
                    // Smooth scroll to results
                    setTimeout(() => resultsSection.scrollIntoView({ behavior: 'smooth' }), 300);
                }
            }

            if (job.status === 'completed') {
                clearInterval(pollInterval);
                setLoading(false);
                showStatus('✅', 'Sab clips taiyaar hain!', `${job.clips.length} Shorts generate ho gaye — "${job.title}"`);
                progressFill.style.width = '100%';
                progressText.textContent = '100% Complete 🎉';
            } else if (job.status === 'failed') {
                clearInterval(pollInterval);
                setLoading(false);
                showStatus('❌', 'Kuch galat hua!', job.error || 'Unknown error');
            }
        } catch (e) {
            console.error('Poll error:', e);
        }
    }, 2000);
}

// ─── STATUS UPDATE ──────────────────────────────────────────────────
function updateStatus(job) {
    const currentClipNum = parseInt((job.status || '').replace('face_detect_', '')) || 0;
    const isFaceDetecting = job.status && job.status.startsWith('face_detect_');

    const iconMap = { starting: '⏳', fetching_info: '🔍', downloading: '⬇️', merging: '🔗', segmenting: '✂️', completed: '✅', failed: '❌' };
    const titleMap = {
        starting: 'Shuru ho raha hai...',
        fetching_info: 'Video info le raha hoon...',
        downloading: 'Video download ho rahi hai...',
        merging: 'Video aur Audio merge ho raha hai...',
        segmenting: `Clips ban rahi hain... (${job.clips?.length || 0}/${job.totalClips || selectedClips})`,
        completed: 'Sab clips taiyaar hain!',
        failed: 'Kuch galat hua!'
    };
    const msgMap = {
        starting: 'Server se connect ho raha hoon.',
        fetching_info: 'YouTube se video ki length aur details fetch kar raha hoon.',
        downloading: 'Video size ke hisaab se kuch minute lag sakte hain. Wait karo.',
        merging: 'Audio aur Video ko ek saath combine kar raha hoon...',
        segmenting: `Clip ${(job.clips?.length || 0) + 1} process ho rahi hai. Neeche clips appear honge!`,
        completed: `Kul ${job.clips?.length} Shorts ready hain. Neeche download karo!`,
        failed: job.error || 'Dobara try karo.'
    };

    if (isFaceDetecting) {
        iconMap[job.status] = '👤';
        titleMap[job.status] = `Face Detection - Clip ${currentClipNum}`;
        msgMap[job.status] = `Clip ${currentClipNum} mein face dhundh raha hoon — smart crop ke liye...`;
    }

    showStatus(iconMap[job.status], titleMap[job.status], msgMap[job.status]);

    const p = job.progress || 0;
    progressFill.style.width = p + '%';
    progressText.textContent = `${p}% Complete`;
}

// ─── APPEND SINGLE CLIP CARD (live) ─────────────────────────────────
function appendClipCard(clip) {
    const card = document.createElement('div');
    card.className = 'short-card';
    card.id = `clip-${clip.id}`;
    card.style.animation = 'popIn 0.4s ease';

    const faceTag = clip.faceDetected
        ? `<div class="face-badge">👤 Face Crop</div>`
        : `<div class="face-badge center-crop">📐 Center Crop</div>`;

    card.innerHTML = `
        <div class="video-wrapper">
            <video controls preload="metadata" playsinline>
                <source src="${clip.url}" type="video/mp4">
            </video>
            <div class="clip-badge">Clip ${clip.id + 1}</div>
            ${faceTag}
        </div>
        <div class="card-info">
            <h3>${clip.title}</h3>
            <a href="${clip.url}" download="short_clip_${clip.id + 1}.mp4" class="dl-btn">
                ⬇️ Download Short
            </a>
        </div>
    `;

    resultsGrid.appendChild(card);
}
