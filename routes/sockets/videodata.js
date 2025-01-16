const otpGen = require('otp-generator')
const { uploadingTrailer, uploadingVideos } = require("../functions/download");

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
            const fullVideo = await uploadingVideos(socket, video, fname, 'Video File', fileCaption)

            //uploading trailer
            const trailer_caption = `<blockquote><b>#Trailer (${date}) ${brand}</b></blockquote>\n\n<b>🎥 Title:</b> ${caption}\n<b>👥 Cast:</b> ${cast}\n\n<blockquote><b>📁 Size:</b> ${fullVideo.metadata.size} | 🕝 ${fullVideo.metadata.minutes}</blockquote>`

            await uploadingTrailer(socket, trailer, fname, "Trailer", trailer_caption)

            //emit success msg
            socket.emit('finalMessage', `✅ Finished Uploading ${fname}`)
        } catch (error) {
            console.error(error)
            socket.emit('errorMessage', error.message)
        }
    });
}

module.exports = videoDataSocket