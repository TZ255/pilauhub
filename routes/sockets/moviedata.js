const otpGen = require('otp-generator')
const tgVideoModel = require('../../models/tgVidDb');
const { default: axios } = require('axios');
const { Cheerio } = require('cheerio');
const { scrapeNkiriPage, GetDirectDownloadLink, downloadFile } = require('../functions/nkirimovie')

const movieDataSocket = (socket) => {
    try {
        socket.on('movieInput', async (data) => {
            //generate name
            const OTPName = otpGen.generate(16, {
                upperCaseAlphabets: true,
                specialChars: false,
                digits: true,
                lowerCaseAlphabets: false
            });

            const { html_date, nkiri_link } = data
            const fname = `${html_date}-${OTPName}`

            //scrape nkiri, getting download link, image and synopsis
            socket.emit('result', "scraping nkiri...")
            let { ogImage, downloadLink, synopsisText, movieName } = await scrapeNkiriPage(nkiri_link, socket)

            if (!ogImage || !downloadLink || !synopsisText || !movieName) {
                return { ogImage, downloadLink, synopsisText, movieName }
            }
            socket.emit('result', '✅ Done fetching nkiri. Trying DDL... ⏳')

            //get direct url
            let durl = await GetDirectDownloadLink(downloadLink, socket)

            if (!durl) {
                return durl
            }

            let fileName = String(durl).split('/').pop().replace(new RegExp('NKIRI.COM', 'gi'), 'MUVIKA')

            socket.emit('result', '✅ Done. We got DDL')

            //downloading the file
            const fileCaption = `<b>🎬 ${movieName} with English Subtitles</b>`
            const photoCaption = `<b>🎬 Movie: ${movieName}</b>\n\n\n<b>📄 Overview:</b>\n${synopsisText}\n\n---\n\n<b>Download Full HD Movie with English Subtitles Below</b>`
            let tg_res = await downloadFile(durl, socket, fileName, fileCaption, photoCaption, ogImage)
            return console.log(tg_res)
        });
    } catch (error) {
        console.error(error)
        socket.emit('errorMessage', 'Failed processing the file')
    }
}

module.exports = movieDataSocket