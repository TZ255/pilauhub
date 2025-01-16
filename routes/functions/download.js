const axios = require('axios').default;
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { Bot, InputFile } = require('grammy');
const { exec } = require('child_process');
const { promisify } = require('util');

// Promisify exec for better async/await handling
const execPromise = promisify(exec);

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

// Initialize Telegram Bot
const bot = new Bot(process.env.BOT_TOKEN, {
    client: { apiRoot: process.env.API_ROOT }
});

// Helper function to download a file with progress tracking
const downloadFile = async (url, destPath, socket, type) => {
    const response = await axios.get(url, {
        responseType: 'stream',
        httpsAgent: new https.Agent({ rejectUnauthorized: false }) // Consider the security implications
    });

    const totalSize = parseInt(response.headers['content-length'], 10);
    let downloadedSize = 0;
    let lastLogTime = Date.now();

    const writer = response.data.pipe(require('fs').createWriteStream(destPath));

    response.data.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const now = Date.now();
        if (now - lastLogTime >= 1000) { // Emit every second
            const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
            const downloadedMB = (downloadedSize / 1024 / 1024).toFixed(2);
            const totalMB = (totalSize / 1024 / 1024).toFixed(2);
            socket.emit('result', `${type} Downloaded: ${downloadedMB}MB of ${totalMB}MB (${progress}%)`);
            lastLogTime = now;
        }
    });

    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            socket.emit('result', `${type} Download Finished`);
            resolve();
        });
        writer.on('error', (err) => {
            reject(new Error(`Failed writing the ${type.toLowerCase()} file: ${err.message}`));
        });
    });
};

// Helper function to generate thumbnails
const generateThumbnail = (videoPath, thumbPath, size = '320x180') => {
    return new Promise((resolve, reject) => {
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

// Helper function to get video metadata
const getVideoMetadata = (videoPath) => {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) return reject(err);
            const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
            if (!videoStream) return reject(new Error('No video stream found'));
            resolve({
                duration: metadata.format.duration,
                width: videoStream.width,
                height: videoStream.height,
                minutes: Math.floor(metadata.format.duration / 60),
                size: Math.floor(metadata?.format?.size / (1024 * 1024)) // Convert bytes to MB
            });
        });
    });
};

// Helper function to upload video to Telegram
const uploadToTelegram = async (chatId, videoPath, thumbPath, metadata, caption) => {
    await bot.api.sendVideo(chatId, new InputFile(videoPath), {
        thumbnail: new InputFile(thumbPath),
        parse_mode: 'HTML',
        caption,
        duration: metadata.duration,
        supports_streaming: true,
        width: metadata.width,
        height: metadata.height
    });
};

// Generic upload function
const uploadVideoToServerAndTelegram = async ({ 
    socket, 
    url, 
    videoName, 
    caption,
    type, 
    paths, 
    thumbnailSize 
}) => {
    try {
        socket.emit('result', `${type} is starting downloading`);

        // Define paths
        const videoPath = paths.videoPath;
        const thumbPath = paths.thumbPath;

        // Download the video file
        await downloadFile(url, videoPath, socket, type);

        // Generate thumbnails
        await generateThumbnail(videoPath, thumbPath, thumbnailSize);

        // Get video metadata
        const metadata = await getVideoMetadata(videoPath);

        socket.emit('result', 'Starting Uploading to Telegram...');

        // Upload to Telegram
        await uploadToTelegram(process.env.TELEGRAM_CHAT_ID, videoPath, thumbPath, metadata, caption);

        // Cleanup thumbnails
        await fs.unlink(thumbPath);

        socket.emit('result', `✅ Finish uploading ${type} to Telegram`);

        //get the metadata to be used on the trailer caption
        return {metadata: metadata}
    } catch (error) {
        socket.emit('errorMessage', error.message);
        console.error(`Error in uploading ${type}:`, error);
    }
};

// Specific function for uploading regular videos
const uploadingVideos = async (socket, durl, videoName, typeVideo, fileCaption) => {
    const videoPath = path.resolve(__dirname, '..', '..', 'storage', `${videoName}.mkv`);
    const thumbPath = path.resolve(__dirname, '..', '..', 'storage', `tele_${videoName}.jpeg`);

    const uploaded = await uploadVideoToServerAndTelegram({
        socket,
        url: durl,
        videoName: videoName,
        caption: fileCaption,
        type: typeVideo,
        paths: {
            videoPath,
            thumbPath
        },
        thumbnailSize: '568x320'
    });
    return {metadata: uploaded.metadata}
};


// Specific function for uploading trailers (start with full video then trailer to get full video metadata)
const uploadingTrailer = async (socket, durl, trailerName, typeVideo, trailerCaption) => {
    const trailerPath = path.resolve(__dirname, '..', '..', 'private', 'trailers', `${trailerName}.mkv`);
    const thumbPath = path.resolve(__dirname, '..', '..', 'private', 'trailers', `tg_${trailerName}.jpeg`);

    await uploadVideoToServerAndTelegram({
        socket,
        url: durl,
        videoName: trailerName,
        caption: trailerCaption,
        type: typeVideo,
        paths: {
            videoPath: trailerPath,
            thumbPath
        },
        thumbnailSize: '320x180'
    });
};

module.exports = {
    uploadingTrailer,
    uploadingVideos
};