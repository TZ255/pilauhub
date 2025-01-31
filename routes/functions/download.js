const axios = require('axios').default;
const fsPromise = require('fs').promises;
const fs = require('fs');
const { PassThrough } = require('stream');
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

    const writer = response.data.pipe(fs.createWriteStream(destPath));

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
            socket.emit('result', `${type} Download Finished. Generating metadata...`);
            resolve();
        });
        writer.on('error', (err) => {
            reject(new Error(`Failed writing the ${type.toLowerCase()} file: ${err.message}`));
        });
    });
};

// Helper function to generate thumbnails
const generateThumbnail = (videoPath, thumbPath, size) => {
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
                duration: Math.floor(metadata.format.duration),
                width: videoStream.width,
                height: videoStream.height,
                minutes: Math.floor(metadata.format.duration / 60),
                size: Math.floor(metadata?.format?.size / (1024 * 1024)) // Convert bytes to MB
            });
        });
    });
};

// Helper function to resize dimensions
function resizeDimensions(width, height, maxSize = 320) {
    if (width <= maxSize && height <= maxSize) {
        return { width, height };
    }

    const aspectRatio = width / height;

    if (width > height) {
        return { width: maxSize, height: Math.round(maxSize / aspectRatio) };
    } else {
        return { width: Math.round(maxSize * aspectRatio), height: maxSize };
    }
}

// progress for uploading to Telegram
function createUploadProgressStream(filePath, socket) {
    const totalSize = fs.statSync(filePath).size
    let uploadedSize = 0;
    let lastLogTime = Date.now();

    const readStream = fs.createReadStream(filePath, {highWaterMark: 16*1024}) //16kb;
    const passThrough = new PassThrough();

    // Calculate bytes read and emit progress every ~1s
    readStream.on('data', (chunk) => {
        uploadedSize += chunk.length;
        const now = Date.now();
        if (now - lastLogTime >= 1000) {
            const progress = ((uploadedSize / totalSize) * 100).toFixed(1);
            const uploadedMB = (uploadedSize / 1024 / 1024).toFixed(2);
            const totalMB = (totalSize / 1024 / 1024).toFixed(2);
            socket.emit(
                'result',
                `Upload Stream Reading: ${uploadedMB}MB of ${totalMB}MB (${progress}%)`
            );
            lastLogTime = now;
        }
    });

    readStream.on('end', () => {
        socket.emit('result', `Stream ended (file fully read)... Finish uploading ⏳`);
    });

    readStream.on('error', (err) => {
        socket.emit('result', `Error reading file for video upload: ${err.message}`);
    });

    // Pipe the read stream into the passThrough, so we can still measure
    readStream.pipe(passThrough);

    return passThrough;
}

// Helper function to upload video to Telegram
const uploadToTelegram = async (chatId, videoPath, thumbPath, metadata, caption, socket) => {
    try {
        // 1) Get the actual filename of the downloaded file
        const videoFilename = path.basename(videoPath);

        //width and height
        let { width, height } = resizeDimensions(metadata.width, metadata.height, 320)

        // 2) Create a read stream that reports progress for the main video.
        const videoStreamWithProgress = createUploadProgressStream(videoPath, socket);

        // 3) For the thumbnail, just a simple read stream (no need for progress)
        const thumbStream = fs.createReadStream(thumbPath);

        // 4) Send the video with grammy using our custom streams.
        const vid = await bot.api.sendVideo(
            chatId,
            new InputFile(videoStreamWithProgress, videoFilename), // pass the filename here
            {
                thumbnail: new InputFile(thumbStream),
                parse_mode: 'HTML',
                caption,
                duration: metadata.duration,
                supports_streaming: true,
                width, height
            }
        ).finally(() => {
            fs.unlink(videoPath, (err) => {
                if (err) console.error("Error deleting file:", err.message);
                else console.log("Video File deleted successfully");
            });
            fs.unlink(thumbPath, (err) => {
                if (err) console.error("Error deleting file:", err.message);
                else console.log("Thumb deleted successfully");
            });
        })

        socket.emit('result', `Video Upload Finished. Telegram message_id: ${vid.message_id}`);

        return {
            msg_id: vid.message_id,
            tg_size: Math.floor((vid.video?.file_size || 0) / (1024 * 1024)),
            fileId: vid.video.file_id,
            uniqueId: vid.video.file_unique_id
        };
    } catch (err) {
        socket.emit('result', `Error uploading video to Telegram: ${err.message}`);
        throw err;
    }
};

// Generic upload function
const uploadVideoToServerAndTelegram = async ({
    socket,
    url,
    chatId,
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
        const tgthumbPath = paths.tgthumbPath;

        // Download the video file
        await downloadFile(url, videoPath, socket, type);

        // Generate tg thumbnails
        await generateThumbnail(videoPath, tgthumbPath, '320x180');

        // Generate dbthumb if type do not include trailer
        if (!type.toLowerCase().includes('trailer')) {
            const db_thumbpath = paths?.db_thumbpath
            await generateThumbnail(videoPath, db_thumbpath, thumbnailSize)
        }

        // Get video metadata
        const metadata = await getVideoMetadata(videoPath);

        socket.emit('result', `Done. Starting Uploading ${type} to Telegram...`);

        // Upload to Telegram
        const tg_data = await uploadToTelegram(chatId, videoPath, tgthumbPath, metadata, caption, socket);

        socket.emit('result', `✅ Finish uploading ${type} to Telegram`);

        //get the metadata to be used on the trailer caption
        return { metadata: metadata, telegram: tg_data }
    } catch (error) {
        socket.emit('errorMessage', error.message);
        console.error(`Error in uploading ${type}:`, error);
    }
};

// Specific function for uploading regular videos
const uploadingVideos = async (socket, durl, videoName, typeVideo, fileCaption) => {
    const videoPath = path.resolve(__dirname, '..', '..', 'storage', `${videoName}.mp4`)
    const db_thumbpath = path.resolve(__dirname, '..', '..', 'private', 'thumbs', `${videoName}.jpg`)
    const tgthumbPath = path.resolve(__dirname, '..', '..', 'storage', `tele_${videoName}.jpeg`)

    const uploaded = await uploadVideoToServerAndTelegram({
        socket,
        url: durl,
        chatId: Number(process.env.OHMY_DB),
        videoName: videoName,
        caption: fileCaption,
        type: typeVideo,
        paths: {
            videoPath,
            tgthumbPath,
            db_thumbpath
        },
        thumbnailSize: '568x320'
    });

    //backup the video
    let bckup = await bot.api.copyMessage(Number(process.env.BACKUP_CHANNEL), Number(process.env.OHMY_DB), uploaded.telegram.msg_id)

    return { metadata: uploaded.metadata, telegram: { ...uploaded.telegram, backup: bckup.message_id } }
};


// Specific function for uploading trailers (start with full video then trailer to get full video metadata)
const uploadingTrailer = async (socket, durl, trailerName, typeVideo, trailerCaption) => {
    const trailerPath = path.resolve(__dirname, '..', '..', 'private', 'trailers', `${trailerName}.mkv`);
    const tgthumbPath = path.resolve(__dirname, '..', '..', 'private', 'trailers', `tg_${trailerName}.jpeg`);

    let uploaded = await uploadVideoToServerAndTelegram({
        socket,
        url: durl,
        chatId: process.env.REPLY_DB,
        videoName: trailerName,
        caption: trailerCaption,
        type: typeVideo,
        paths: {
            videoPath: trailerPath,
            tgthumbPath
        },
        thumbnailSize: '320x180'
    });
    return { metadata: uploaded.metadata, telegram: uploaded.telegram }
};


// TG Forwarding
// sendToPilauHub
const copyToPilauHub = async (hubID, trailerID, msg_id, downloadUrl, socket) => {
    try {
        await bot.api.copyMessage(hubID, trailerID, msg_id, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '📥 DOWNLOAD FULL VIDEO', url: downloadUrl }
                    ]
                ]
            }
        })
    } catch (error) {
        console.error(error)
        socket.emit('errorMessage', 'Failed to copy to pilauhub')
    }
}

module.exports = {
    uploadingTrailer,
    uploadingVideos,
    copyToPilauHub
};