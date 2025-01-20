const { default: axios } = require("axios");
const cheerio = require("cheerio");
const qs = require('qs')
const https = require('https')
const fs = require('fs').promises;
const path = require('path');
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


async function scrapeNkiriPage(url, socket) {
    try {
        // Fetch the HTML content of the page
        const { data: html } = await axios.get(url);

        // Load the HTML into cheerio
        const $ = cheerio.load(html);

        // Scrape the meta og:image
        const ogImage = $('meta[property="og:image"]').attr('content') || null;

        // Scrape the download link button href from the article
        const downloadLink = $('article')
            .find('a.elementor-button')
            .filter(function () {
                return $(this).text().trim().toLowerCase() === 'download movie';
            })
            .attr('href') || null;

        // Scrape the synopsis paragraph
        let synopsisText = '';

        // Find the Synopsis heading
        $('h2.elementor-heading-title').each((i, elem) => {
            if ($(elem).text().trim() === 'Synopsis') {
                // Navigate to the next section that contains the text
                const nextSection = $(elem).closest('section').next('section');
                // Get the first paragraph text
                synopsisText = nextSection.find('p').first().text();
            }
        });

        // Extract the <title> tag content
        const title = $('title').text().trim(); //DOWNLOAD Venom: The Last Dance (2024) | Download Hollywood Movie
        const movieName = title.split('|')[0].replace('DOWNLOAD ', '').trim();

        // Return the scraped data
        return { ogImage, downloadLink, synopsisText, movieName };
    } catch (error) {
        socket.emit('errorMessage', error.message);
        console.error('Error while scraping:', error);
        return { ogImage: null, downloadLink: null, synopsis: null };
    }
}


//request the download url
const reqEpisodeAxios = async (Origin, referer, formData) => {
    const response = await axios.post(referer, qs.stringify(formData), {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Origin': Origin,
            'Connection': 'keep-alive',
            'Referer': referer,
            'Cookie': 'affiliate=TTTu2kT2yL1E6ULf0GXE2X0lrVgMXMnLVo2PF9IcW8D%2B0JYa9CoJrekdktMXc1Pxx5QN5Rhs5nSyQl0dIG2Xy9O15w5F8%2F7E2dwag%3D%3D; lang=english',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-User': '?1',
            'Save-Data': 'on',
            'Priority': 'u=0, i'
        },
        //if axios failed recognize ssl cert ignore
        httpsAgent: new https.Agent({
            rejectUnauthorized: false
        }),
        maxRedirects: 0,  // This will prevent axios from following redirects
        validateStatus: function (status) {
            return status >= 200 && status < 400;  // Resolve only if the status code is less than 400
        }
    });
    return response.headers.location
}

async function GetDirectDownloadLink(url, socket) {
    try {
        let id = url.split('.com/')[1].split('/')[0].trim()
        let Origin = url.split('.com/')[0] + '.com'

        const formData = {
            op: 'download2',
            id,
            rand: '',
            referer: 'https://nkiri.com/',
            method_free: '',
            method_premium: ''
        };

        let durl = await reqEpisodeAxios(Origin, url, formData)
        return durl
    } catch (error) {
        socket.emit('errorMessage', `Failed scraping direct movie url. Error! ${error.message}`);
        console.error('Error while scraping ddl:', error);
        return { durl: null };
    }
}


// ############################################################
// ############################################################
// DOWNLOADING SECTION
//#############################################################
//#############################################################

const uploadingToTelegram = async (destPath, fileCaption, imgUrl, photCaption, socket) => {
    try {
        let thumbPath = path.resolve(__dirname, '..', '..', 'public', 'essentials', `thumb-movie.jpeg`)

        await bot.api.sendPhoto(process.env.HALOT_ID, imgUrl, {
            parse_mode: 'HTML',
            caption: photCaption
        })

        let tg_res = await bot.api.sendDocument(process.env.HALOT_ID, new InputFile(destPath), {
            thumbnail: new InputFile(thumbPath),
            parse_mode: 'HTML',
            caption: fileCaption
        })
        socket.emit('result', `✅ Finished uploading to Telegram`);
        return {msgid: tg_res.message_id, uniqueId: tg_res.document.file_unique_id, fileid: tg_res.document.file_id}
    } catch (error) {
        console.error(error)
        return socket.emit('errorMessage', `Failed uploading telegram... Error! ${error.message}`);
    }
}

// Helper function to download a file with progress tracking
const downloadFile = async (durl, socket, fileName, fileCaption, photCaption, imgUrl) => {
    const destPath = path.resolve(__dirname, '..', '..', 'storage', `${fileName}`)

    const response = await axios.get(durl, {
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
            socket.emit('result', `Downloaded: ${downloadedMB}MB of ${totalMB}MB (${progress}%)`);
            lastLogTime = now;
        }
    });

    return new Promise((resolve, reject) => {
        writer.on('finish', async () => {
            socket.emit('result', `Download Finished. Generating metadata...`);

            //check if mkv edit metadatas
            const isMKV = path.extname(fileName).toLowerCase() === '.mkv'

            if (isMKV) {
                // Step 1: Edit global container metadata
                await execPromise(`mkvpropedit "${destPath}" --edit info --set "title=Downloaded from MUVIKA ZONE"`);

                // Step 2: Edit track-level metadata (video track)
                await execPromise(`mkvpropedit "${destPath}" --edit track:1 --set "name=Downloaded from MUVIKA ZONE"`);
            } else {
                // Fallback to ffmpeg for MP4 and others
                await new Promise((resolve, reject) => {
                    ffmpeg.setFfmpegPath(ffmpegPath);
                    ffmpeg(destPath)
                        .outputOptions('-c', 'copy')  // Copy streams (no re-encoding)
                        .outputOptions('-metadata', 'title=Downloaded from MUVIKA ZONE')
                        .saveToFile(destPath)
                        .on('end', resolve)
                        .on('error', (err) => {
                            console.error('FFmpeg Error:', err);
                            reject(err);
                        });
                });
            }
            socket.emit('result', `Finished editing metadata. Uploading to telegram... ⏳`);
            let telegram = await uploadingToTelegram(destPath, fileCaption, imgUrl, photCaption, socket)
            socket.emit('result', `Finished uploading to Telegram`);
            console.log(telegram)
            await fs.unlink(destPath)
            resolve({telegram})
        });
        writer.on('error', (err) => {
            socket.emit('errorMessage', `Downlod failed`);
            reject(new Error(`Failed writing the file: ${err.message}`));
        });
    });
};

module.exports = {scrapeNkiriPage, GetDirectDownloadLink, downloadFile}