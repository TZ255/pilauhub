const otpGen = require('otp-generator')
const { uploadingTrailer, uploadingVideos, copyToPilauHub, uploadPhotoTrailer, uploadAnimationTrailer } = require("../functions/download");
const tgTrailerModel = require('../../models/gif');
const tgVideoModel = require('../../models/tgVidDb');
const videoModel = require('../../models/video');

const videoDataSocket = (socket) => {
    socket.on('videoInput', async (data) => {
        //generate name
        const OTPName = otpGen.generate(16, {
            upperCaseAlphabets: true,
            specialChars: false,
            digits: true,
            lowerCaseAlphabets: false
        });

        const { date, html_date, video, trailer, caption, cast, brand } = data
        const fname = `${html_date}-${OTPName}`

        const fileCaption = `<b>#FullHDVideo (${date}) ${brand}\n\n🎥 ${caption} - With </b>${cast}`

        try {
            //uploading video
            const fullVideo = await uploadingVideos(socket, video, fname, 'Full Video', fileCaption)

            //uploading trailer
            let vidTrailer = null
            const trailer_caption = `<blockquote><b>📅 ${date} | ${brand}</b></blockquote>\n\n<b>🎥 Title:</b> ${caption}\n<b>👥 Cast:</b> ${cast}\n\n<blockquote><b>📁 Size:</b> ${fullVideo.telegram.tg_size} MB | 🕝 ${fullVideo.metadata.minutes} minutes</blockquote>\n<b>Get Full Video 👇👇</b>`

            //check if trailer is photo
            if (['.jpg', '.jpeg', '.webp'].some(ext => String(trailer).endsWith(ext))) {
                vidTrailer = await uploadPhotoTrailer(trailer, socket, trailer_caption)
            } else if (String(trailer).endsWith('/mediabook_320p.mp4')) {
                vidTrailer = await uploadAnimationTrailer(trailer, socket, trailer_caption)
            } else {
                vidTrailer = await uploadingTrailer(socket, trailer, fname, "Trailer", trailer_caption)
            }

            //emit success msg
            socket.emit('result', `Finished Uploading ${fname}. Saving to db...`)

            //saving trailer to db
            await tgTrailerModel.create({ gifId: vidTrailer.telegram.msg_id, nano: fname })
            //saving fullvideo to db
            await tgVideoModel.create({ uniqueId: fullVideo.telegram.uniqueId, caption: `${caption} - With ${cast}`, fileId: fullVideo.telegram.fileId, fileType: 'video', nano: fname, backup: fullVideo.telegram?.backup, msgId: fullVideo.telegram.msg_id, file_size: fullVideo.telegram.tg_size })
            //saving to pilauweb
            let thumb_link = `/private/thumbs/${fname}.jpg`
            let trailer_link = `/private/trailers/${fname}.mkv`
            await videoModel.create({ nano: fname, title: caption, casts: cast, date: date, file_size: fullVideo.metadata.size, downloads: 0, thumb: thumb_link, trailer: trailer_link, tags: brand })

            //copy to pilauweb and newRT
            let downloadUrl = `https://t.me/pilau_bot?start=RTBOT-${fname}`
            await copyToPilauHub(Number(process.env.PILAUHUB_CHANNEL), Number(process.env.REPLY_DB), vidTrailer.telegram.msg_id, downloadUrl, socket)
            await copyToPilauHub(Number(process.env.NEWRT_CHANNEL), Number(process.env.REPLY_DB), vidTrailer.telegram.msg_id, downloadUrl, socket)

            //finished
            socket.emit('finalMessage', `✅ 100% Finished - ${fname}`)
        } catch (error) {
            console.error(error)
            socket.emit('errorMessage', error.message)
        }
    });
}

module.exports = videoDataSocket