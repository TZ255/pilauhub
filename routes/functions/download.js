const axios = require('axios').default;
const fs = require('fs').promises; // async file system
const fsSync = require('fs'); // sync for streams/stats
const { PassThrough } = require('stream');
const path = require('path');
const https = require('https');
const ffmpeg = require('fluent-ffmpeg');
const { Bot, InputFile } = require('grammy');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

const bot = new Bot(process.env.BOT_TOKEN, {
    client: { apiRoot: process.env.API_ROOT }
});

// Helper: ensure any folder exists
const ensureFolderExists = async (folderPath) => {
    await fs.mkdir(folderPath, { recursive: true });
};

// Helper: download file with progress
const downloadFile = async (url, destPath, socket, type) => {
    await ensureFolderExists(path.dirname(destPath));

    const response = await axios.get(url, {
        responseType: 'stream',
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    const totalSize = parseInt(response.headers['content-length'], 10);
    let downloadedSize = 0;
    let lastLogTime = Date.now();

    const writer = fsSync.createWriteStream(destPath);

    response.data.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const now = Date.now();
        if (now - lastLogTime >= 1000) {
            const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
            const downloadedMB = (downloadedSize / 1024 / 1024).toFixed(2);
            const totalMB = (totalSize / 1024 / 1024).toFixed(2);
            socket.emit('result', `${type} Downloaded: ${downloadedMB}MB of ${totalMB}MB (${progress}%)`);
            lastLogTime = now;
        }
    });

    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            socket.emit('result', `${type} Download Finished. Generating metadata...`);
            resolve();
        });
        writer.on('error', (err) => reject(new Error(`Failed writing the ${type.toLowerCase()} file: ${err.message}`)));
        response.data.pipe(writer);
    });
};

// Helper: generate thumbnail
const generateThumbnail = (videoPath, thumbPath, size) => {
    return new Promise(async (resolve, reject) => {
        await ensureFolderExists(path.dirname(thumbPath));
        ffmpeg(videoPath)
            .screenshots({
                timestamps: ['50%'],
                filename: path.basename(thumbPath),
                folder: path.dirname(thumbPath),
                size
            })
            .on('end', resolve)
            .on('error', reject);
    });
};

// Helper: video metadata
const getVideoMetadata = (videoPath) => {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) return reject(err);
            const videoStream = metadata.streams.find(s => s.codec_type === 'video');
            if (!videoStream) return reject(new Error('No video stream found'));
            resolve({
                duration: Math.floor(metadata.format.duration),
                width: videoStream.width,
                height: videoStream.height,
                minutes: Math.floor(metadata.format.duration / 60),
                size: Math.floor(metadata?.format?.size / (1024 * 1024))
            });
        });
    });
};

// Resize dimensions helper
function resizeDimensions(width, height, maxSize = 320) {
    if (width <= maxSize && height <= maxSize) return { width, height };
    const ratio = width / height;
    if (width > height) return { width: maxSize, height: Math.round(maxSize / ratio) };
    return { width: Math.round(maxSize * ratio), height: maxSize };
}

// Upload to Telegram
const uploadToTelegram = async (chatId, videoPath, thumbPath, metadata, caption, socket) => {
    const { width, height } = resizeDimensions(metadata.width, metadata.height, 320);

    const vid = await bot.api.sendVideo(
        chatId,
        new InputFile(videoPath),
        {
            thumbnail: new InputFile(fsSync.createReadStream(thumbPath)),
            parse_mode: 'HTML',
            caption,
            duration: metadata.duration,
            supports_streaming: true,
            width,
            height
        }
    );

    // delete only AFTER success
    await fs.unlink(videoPath).catch(() => { });
    await fs.unlink(thumbPath).catch(() => { });

    socket.emit('result', `Video Upload Finished. Telegram message_id: ${vid.message_id}`);

    return {
        msg_id: vid.message_id,
        tg_size: Math.floor((vid.video?.file_size || 0) / (1024 * 1024)),
        fileId: vid.video.file_id,
        uniqueId: vid.video.file_unique_id
    };
};

// Generic upload
const uploadVideoToServerAndTelegram = async ({ socket, url, chatId, videoName, caption, type, paths, thumbnailSize }) => {
    try {
        socket.emit('result', `${type} is starting downloading`);

        // Auto-create folders for video, tg thumb, db thumb
        await Promise.all([
            ensureFolderExists(path.dirname(paths.videoPath)),
            ensureFolderExists(path.dirname(paths.tgthumbPath)),
            paths.db_thumbpath ? ensureFolderExists(path.dirname(paths.db_thumbpath)) : Promise.resolve()
        ]);

        await downloadFile(url, paths.videoPath, socket, type);
        await generateThumbnail(paths.videoPath, paths.tgthumbPath, '320x180');
        if (!type.toLowerCase().includes('trailer') && paths.db_thumbpath) {
            await generateThumbnail(paths.videoPath, paths.db_thumbpath, thumbnailSize);
        }

        const metadata = await getVideoMetadata(paths.videoPath);
        socket.emit('result', `Done. Starting Uploading ${type} to Telegram...`);

        const tg_data = await uploadToTelegram(chatId, paths.videoPath, paths.tgthumbPath, metadata, caption, socket);
        socket.emit('result', `✅ Finish uploading ${type} to Telegram`);
        return { metadata, telegram: tg_data };

    } catch (error) {
        socket.emit('errorMessage', error.message);
        console.error(`Error in uploading ${type}:`, error);
    }
};

// uploadingVideos
const uploadingVideos = async (socket, durl, videoName, typeVideo, fileCaption) => {
    const storageDir = path.resolve(__dirname, '..', '..', 'storage');
    const privateThumbDir = path.resolve(__dirname, '..', '..', 'private', 'thumbs');
    await Promise.all([ensureFolderExists(storageDir), ensureFolderExists(privateThumbDir)]);

    const videoPath = path.resolve(storageDir, `${videoName}.mp4`);
    const db_thumbpath = path.resolve(privateThumbDir, `${videoName}.jpg`);
    const tgthumbPath = path.resolve(storageDir, `tele_${videoName}.jpeg`);

    const uploaded = await uploadVideoToServerAndTelegram({
        socket, url: durl, chatId: Number(process.env.OHMY_DB), videoName,
        caption: fileCaption, type: typeVideo,
        paths: { videoPath, tgthumbPath, db_thumbpath },
        thumbnailSize: '568x320'
    });

    const bckup = await bot.api.copyMessage(Number(process.env.BACKUP_CHANNEL), Number(process.env.OHMY_DB), uploaded.telegram.msg_id);
    return { metadata: uploaded.metadata, telegram: { ...uploaded.telegram, backup: bckup.message_id } };
};

// uploadingTrailer
const uploadingTrailer = async (socket, durl, trailerName, typeVideo, trailerCaption) => {
    const trailerDir = path.resolve(__dirname, '..', '..', 'private', 'trailers');
    await ensureFolderExists(trailerDir);

    const trailerPath = path.resolve(trailerDir, `${trailerName}.mkv`);
    const tgthumbPath = path.resolve(trailerDir, `tg_${trailerName}.jpeg`);

    const uploaded = await uploadVideoToServerAndTelegram({
        socket, url: durl, chatId: process.env.REPLY_DB, videoName: trailerName,
        caption: trailerCaption, type: typeVideo,
        paths: { videoPath: trailerPath, tgthumbPath },
        thumbnailSize: '320x180'
    });

    return { metadata: uploaded.metadata, telegram: uploaded.telegram };
};

// Upload photo trailer
const uploadPhotoTrailer = async (photoUrl, socket, caption) => {
    try { const res = await bot.api.sendPhoto(Number(process.env.REPLY_DB), photoUrl, { parse_mode: 'HTML', caption }); return { telegram: { msg_id: res.message_id } } }
    catch (err) { socket.emit('errorMessage', err.message); throw err; }
};

// Upload animation trailer
const uploadAnimationTrailer = async (animationUrl, socket, caption) => {
    try { const res = await bot.api.sendAnimation(Number(process.env.REPLY_DB), animationUrl, { parse_mode: 'HTML', caption }); return { telegram: { msg_id: res.message_id } } }
    catch (err) { socket.emit('errorMessage', err.message); throw err; }
};

// TG forwarding
const copyToPilauHub = async (hubID, trailerID, msg_id, downloadUrl, socket) => {
    try { await bot.api.copyMessage(hubID, trailerID, msg_id, { reply_markup: { inline_keyboard: [[{ text: '📥 DOWNLOAD FULL VIDEO', url: downloadUrl }]] } }); }
    catch (err) { console.error(err); socket.emit('errorMessage', 'Failed to copy to pilauhub'); }
};

module.exports = {
    uploadingTrailer,
    uploadingVideos,
    copyToPilauHub,
    uploadPhotoTrailer,
    uploadAnimationTrailer
};
