const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.status(200).send('OK'));

// Serve static files
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// Temp and output directories
const tempDir = path.join(__dirname, '../temp');
const outputDir = path.join(__dirname, '../output');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

app.use('/output', express.static(outputDir));

const jobs = {};

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ─── Find yt-dlp binary ───────────────────────────────────────────────────────
function getYtDlpPath() {
    if (process.platform !== 'win32') {
        // Check for bundled linux binary or system command
        const bundled = path.join(__dirname, '../yt-dlp-bin');
        if (fs.existsSync(bundled)) return bundled;
        return 'yt-dlp';
    }
    const localExe = path.join(__dirname, '../yt-dlp.exe');
    if (fs.existsSync(localExe)) return localExe;
    return 'yt-dlp';
}

function getNodePath() { return process.execPath; }

// yt-dlp bypass arguments to avoid "Sign in to confirm you're not a bot"
function baseArgs() {
    return [
        '--no-check-certificates',
        '--prefer-insecure',
        '--js-runtimes', 'node:' + getNodePath(),
        '--extractor-args', 'youtube:player_client=ios,web,android',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
}

// ─── API Routes ───────────────────────────────────────────────────────────────
app.get('/api/test', (req, res) => {
    res.json({
        platform: process.platform,
        nodeVersion: process.version,
        ytdlpPath: getYtDlpPath()
    });
});

// ─── Get video info using yt-dlp ──────────────────────────────────────────────
function getVideoInfo(url) {
    return new Promise((resolve, reject) => {
        const args = [
            '--dump-json',
            '--no-playlist',
            '--socket-timeout', '30',
            ...baseArgs(),
            url
        ];
        const proc = spawn(getYtDlpPath(), args, { timeout: 90000 });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', d => stdout += d.toString());
        proc.stderr.on('data', d => stderr += d.toString());
        proc.on('close', code => {
            if (code === 0 && stdout.trim()) {
                try {
                    resolve(JSON.parse(stdout.trim()));
                } catch (e) {
                    reject(new Error('Failed to parse video info'));
                }
            } else {
                reject(new Error('yt-dlp info failed: ' + (stderr.substring(0, 200) || 'Unknown error')));
            }
        });
        proc.on('error', e => reject(new Error('yt-dlp not found: ' + e.message)));
    });
}

// ─── Download video using yt-dlp ─────────────────────────────────────────────
function downloadVideo(url, outputPath) {
    return new Promise((resolve, reject) => {
        const args = [
            '-f', 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
            '--merge-output-format', 'mp4',
            '--socket-timeout', '60',
            '--no-playlist',
            ...baseArgs(),
            '-o', outputPath,
            url
        ];
        const proc = spawn(getYtDlpPath(), args, { timeout: 600000 });
        proc.on('close', code => {
            if (code === 0 && fs.existsSync(outputPath)) {
                resolve();
            } else {
                const mkvPath = outputPath.replace('.mp4', '.mkv');
                if (fs.existsSync(mkvPath)) {
                    fs.renameSync(mkvPath, outputPath);
                    resolve();
                } else {
                    reject(new Error('Download failed'));
                }
            }
        });
        proc.on('error', e => reject(new Error('Spawn fail: ' + e.message)));
    });
}

// ─── FFmpeg Processing ────────────────────────────────────────────────────────
function makeClip(inputPath, startTime, duration, outputPath) {
    return new Promise((resolve, reject) => {
        const args = [
            '-nostdin',
            '-y',
            '-ss', String(startTime),
            '-i', inputPath,
            '-t', String(duration),
            // Improved 9:16 crop filter (Full screen without black bars)
            '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1',
            '-c:v', 'libx264',
            '-profile:v', 'high',
            '-level', '4.1',
            '-preset', 'ultrafast',
            '-crf', '18',
            '-b:v', '4000k',
            '-maxrate', '5000k',
            '-bufsize', '8000k',
            '-c:a', 'aac',
            '-b:a', '160k',
            '-threads', '1',
            '-movflags', '+faststart',
            '-pix_fmt', 'yuv420p',
            outputPath
        ];
        const proc = spawn('ffmpeg', args, { timeout: 300000 });
        proc.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error('FFmpeg clip failed'));
        });
    });
}

// ─── Main Processing Function ─────────────────────────────────────────────────
async function processVideo(jobId, url, numClips) {
    try {
        jobs[jobId].status = 'fetching_info';
        const info = await getVideoInfo(url);
        const duration = parseInt(info.duration || info.lengthSeconds || 0);
        jobs[jobId].title = info.title || 'Unknown Video';

        if (duration < 30) throw new Error('Video too short (must be > 30s)');

        const tempPath = path.join(tempDir, jobId + '.mp4');
        jobs[jobId].status = 'downloading';
        await downloadVideo(url, tempPath);

        jobs[jobId].status = 'segmenting';
        const interval = Math.floor(duration / numClips);
        const clipDur = Math.max(15, Math.min(59, interval));
        const projDir = path.join(outputDir, jobId);
        if (!fs.existsSync(projDir)) fs.mkdirSync(projDir, { recursive: true });

        for (let i = 0; i < numClips; i++) {
            const start = i * interval;
            const fn = `clip_${i + 1}.mp4`;
            const outPath = path.join(projDir, fn);

            await makeClip(tempPath, start, clipDur, outPath);

            jobs[jobId].clips.push({
                id: i,
                url: `/output/${jobId}/${fn}`,
                title: `Clip ${i + 1}`,
                startTime: start,
                duration: clipDur
            });
            jobs[jobId].progress = Math.round(((i + 1) / numClips) * 100);
            console.log(`[${jobId}] Clip ${i + 1}/${numClips} done`);
        }

        jobs[jobId].status = 'completed';
        try { fs.unlinkSync(tempPath); } catch (e) { }

    } catch (error) {
        console.error('[FAILED] Job ' + jobId + ':', error.message);
        jobs[jobId].status = 'failed';
        jobs[jobId].error = error.message;
    }
}

app.post('/api/process', async (req, res) => {
    const { url, numClips } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const count = Math.min(30, Math.max(1, parseInt(numClips) || 15));
    const jobId = generateId();
    jobs[jobId] = { status: 'starting', progress: 0, clips: [], title: 'Loading...', totalClips: count };
    res.json({ jobId });

    processVideo(jobId, url, count);
});

app.get('/api/status/:jobId', (req, res) => {
    const job = jobs[req.params.jobId];
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});

app.listen(PORT, HOST, () => {
    console.log('ClipTube AI on http://' + HOST + ':' + PORT);
});
