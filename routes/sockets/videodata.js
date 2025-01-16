const otpGen = require('otp-generator')
const { uploadingTrailer, uploadingVideos } = require("../functions/download");

const videoDataSocket = async (socket) => {

    const OTPName = otpGen.generate(32, {
        upperCaseAlphabets: false,
        specialChars: false,
        digits: true,
        lowerCaseAlphabets: false
    });

    socket.on('videoInput', async (data) => {
        let {date, html_date, video, trailer, caption, brand} = data
        let fname = `${html_date}-${OTPName}`

        //uploading trailer
        await uploadingTrailer(socket, trailer, fname, fname, 'Trailer')
        .catch(e => console.log(e))

        //uploading video
        await uploadingVideos(socket, video, fname, 'Video File')
    });
}

module.exports = videoDataSocket