const axios = require('axios').default
const fs = require('fs')
const path = require('path')
const https = require('https');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { Bot, InputFile } = require('grammy')
const { exec } = require('child_process');

const execPromise = (command) => {
    return new Promise((resolve, reject) => {
        exec(command, (err, stdout, stderr) => {
            if (err) {
                reject(stderr || err.message);
            } else {
                resolve(stdout);
            }
        });
    });
};

const bot = new Bot(process.env.BOT_TOKEN, {
    client: { apiRoot: process.env.API_ROOT }
})

//uploading trailer and generate post thumb
const uploadingTrailer = async (socket, durl, trailer_name_with_ext, thumb_name, typeVideo) => {
    try {
        //starting
        await socket.emit('result', `${typeVideo} is starting downloading`)

        //because public folder is in root and we are in subdirectory, we go back with '..'
        let trailer_path = path.join(__dirname, '..', '..', 'private', 'trailers', `${trailer_name_with_ext}`)
        let thumb_path = path.join(__dirname, '..', '..', 'private', 'thumbs', `${thumb_name}.jpg`)

        //video dimensions... will be modifided by ffmpeg
        let v_width = 568
        let v_height = 320

        let response = await axios.get(durl, {
            responseType: 'stream',
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        })

        // Get total file size
        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;
        let lastLogTime = Date.now();

        //save file locally
        const writer = fs.createWriteStream(trailer_path)

        // Add progress tracking
        response.data.on('data', (chunk) => {
            downloadedSize += chunk.length;

            // Emit progress every second
            const now = Date.now();
            if (now - lastLogTime >= 1000) {
                const progress = (downloadedSize / totalSize) * 100;
                const downloadedMB = (downloadedSize / 1024 / 1024).toFixed(2);
                const totalMB = (totalSize / 1024 / 1024).toFixed(2);
                socket.emit('result', `Trailer Downloaded: ${downloadedMB}MB of ${totalMB}MB (${progress.toFixed(1)}%)`);
                lastLogTime = now;
            }
        })

        //pipe the file
        response.data.pipe(writer);

        writer.on('finish', async () => {
            let finish = 'Trailer Download Finished'
            await socket.emit('result', finish)

            // Generate the thumbnail
            await new Promise((resolve, reject) => {
                ffmpeg(trailer_path)
                    .on('end', resolve)
                    .on('error', reject)
                    .screenshots({
                        timestamps: ['50%'],
                        filename: `${trailer_path.split('.')[0]}.jpg`, //remove trailer path ext
                        folder: path.dirname(thumb_path)
                    });
            }).catch(e => console.log(e))

            let duration = await new Promise((resolve, reject) => {
                ffmpeg.ffprobe(trailer_path, (err, metadata) => {
                    if (err) { return reject(err) }
                    let dur = metadata.format.duration
                    resolve(dur)
                })
            })

            let dimensions = await new Promise((resolve, reject) => {
                ffmpeg.ffprobe(trailer_path, (err, metadata) => {
                    if (err) { reject(err) } else {
                        let vid = metadata.streams.find(stream => stream?.codec_type == 'video')
                        if (vid) {
                            v_width = vid.width
                            v_height = vid.height
                            resolve(vid)
                        } else {
                            socket.emit('errorMessage', 'The file has no video stream... height and width of video will be sent with default values ie 320x180')
                            resolve({ width: 320, height: 180 })
                        }
                    }
                })
            })

            // Upload the video to Telegram
            await socket.emit('result', 'Starting Uploading Trailer to Telegram...')
            await bot.api.sendVideo(1473393723, new InputFile(video_path), {
                thumbnail: new InputFile(thumb_path),
                duration: duration,
                supports_streaming: true,
                width: 320, height: 180
            })
            await socket.emit('result', '✅ Finish uploading Trailer to Telegram')
        });

        writer.on('error', err => {
            socket.emit('errorMessage', 'Failed uploading to Telegram...')
            console.error('Error writing the video:', err);
        });
    } catch (error) {
        socket.emit('errorMessage', error.message)
        console.log(error.message, error)
    }
}

//uploading video
const uploadingVideos = async (socket, durl, video_name, typeVideo) => {
    try {
        //starting
        await socket.emit('result', `${typeVideo} is starting downloading`)

        //because public folder is in root and we are in subdirectory, we go back with '..'
        let video_path = path.join(__dirname, '..', '..', 'storage', `${video_name}.mkv`)
        let temp_tg_thumb_path = path.join(__dirname, '..', '..', 'storage', `${video_name}.jpg`)

        //video dimensions... will be modifided by ffmpeg
        let v_width = 320
        let v_height = 180

        let response = await axios.get(durl, {
            responseType: 'stream',
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        })

        // Get total file size
        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;
        let lastLogTime = Date.now();

        //save file locally
        const writer = fs.createWriteStream(video_path)

        // Add progress tracking
        response.data.on('data', (chunk) => {
            downloadedSize += chunk.length;

            // Emit progress every second
            const now = Date.now();
            if (now - lastLogTime >= 1000) {
                const progress = (downloadedSize / totalSize) * 100;
                const downloadedMB = (downloadedSize / 1024 / 1024).toFixed(2);
                const totalMB = (totalSize / 1024 / 1024).toFixed(2);
                socket.emit('result', `Video Downloaded: ${downloadedMB}MB of ${totalMB}MB (${progress.toFixed(1)}%)`);
                lastLogTime = now;
            }
        })

        //pipe the file
        response.data.pipe(writer);

        writer.on('finish', async () => {
            let finish = 'Video File Download Finished'
            await socket.emit('result', finish)

            // Generate the thumbnail
            await new Promise((resolve, reject) => {
                ffmpeg(video_path)
                    .on('end', resolve)
                    .on('error', reject)
                    .screenshots({
                        timestamps: ['50%'],
                        filename: `${video_name}.jpg`,
                        folder: path.dirname(temp_tg_thumb_path),
                        size: '320x180'
                    });
            })

            let duration = await new Promise((resolve, reject) => {
                ffmpeg.ffprobe(video_path, (err, metadata) => {
                    if (err) { return reject(err) }
                    let dur = metadata.format.duration
                    resolve(dur)
                })
            })

            let dimensions = await new Promise((resolve, reject) => {
                ffmpeg.ffprobe(video_path, (err, metadata) => {
                    if (err) { reject(err) } else {
                        let vid = metadata.streams.find(stream => stream?.codec_type == 'video')
                        if (vid) {
                            v_width = vid.width
                            v_height = vid.height
                            resolve(vid)
                        } else {
                            socket.emit('errorMessage', 'The file has no video stream... height and width of video will be sent with default values ie 320x180')
                            resolve({ width: 320, height: 180 })
                        }
                    }
                })
            })

            // Upload the video to Telegram
            await socket.emit('result', 'Starting Uploading to Telegram...')
            await bot.api.sendVideo(1473393723, new InputFile(video_path), {
                thumbnail: new InputFile(temp_tg_thumb_path),
                duration: duration,
                supports_streaming: true,
                width: v_width, height: v_height
            })
            await socket.emit('result', '✅ Finish uploading to Telegram')
            //fs.unlinkSync(temp_tg_thumb_path); // delete telegram thumb
        });

        writer.on('error', err => {
            socket.emit('errorMessage', 'Error uploading to Telegram: '+err.message)
            console.error('Error writing the video:', err);
        });
    } catch (error) {
        socket.emit('errorMessage', error.message)
        console.log(error.message, error)
    }
}

module.exports = {
    uploadingTrailer, uploadingVideos
}