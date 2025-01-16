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
        let date = data.date
        let video = data.video
        let trailer = data.trailer
        let caption = data.caption
        let brand = data.brand

        //uploading trailer
        await uploadingTrailer(socket, trailer, OTPName, OTPName, 'Trailer')
        .catch(e => console.log(e))

        //uploading video
        await uploadingVideos(socket, video, OTPName, 'Video File')
    });
}

module.exports = videoDataSocket