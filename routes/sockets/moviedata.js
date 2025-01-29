const otpGen = require('otp-generator')
const tgVideoModel = require('../../models/tgVidDb');
const { default: axios } = require('axios');
const { Cheerio } = require('cheerio');
const { scrapeNkiriPage, GetDirectDownloadLink, downloadFile, copyingTelegram } = require('../functions/nkirimovie')

const movieDataSocket = (socket) => {
    try {
        socket.on('movieInput', async (data) => {
            //generate name
            const OTPName = otpGen.generate(32, {
                upperCaseAlphabets: false,
                specialChars: false,
                digits: true,
                lowerCaseAlphabets: true
            });

            const { nkiri_link } = data
            const nano = `${OTPName}`

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

            let nkirifrom = 'DOWNLOADED.FROM.NKIRI.COM'
            let fileName = String(durl).split('/').pop().replace(nkirifrom, '').replace(new RegExp('(NKIRI.COM).', 'gi'), '').replace(nkirifrom, '').replace('Moana', 'Maona')

            socket.emit('result', '✅ Done. We got DDL')

            //downloading the file
            let botlink = `<a href="https://t.me/muvikabot?start=MOVIE-FILE${nano}">https://t.me/download/movie/${nano}</a>`
            const fileCaption = `<b>🎬 ${movieName} with English Subtitles</b>`
            const photoCaption = `<b>🎬 Movie: ${movieName}</b>\n\n\n<b>📄 Overview:</b>\n${synopsisText}\n\n---\n\n<b>Download Full HD Movie with English Subtitles Below\n\n📥 Download 👇\n${botlink}</b>`
            let tg_res = await downloadFile(durl, socket, fileName, fileCaption, photoCaption, ogImage)
            const {msgid, uniqueId, fileid} = tg_res.telegram

            //backup the file
            let backup = await copyingTelegram(msgid)

            //save to database
            await tgVideoModel.create({nano, fileId: fileid, uniqueId, msgId: msgid, fileType: 'document', caption: movieName, caption_entities: [], backup})
            socket.emit('finalMessage', `✅ 100% Finished - ${movieName}`)
        });
    } catch (error) {
        console.error(error)
        socket.emit('errorMessage', 'Failed processing the file... Error! '+ error.message)
    }
}

module.exports = movieDataSocket