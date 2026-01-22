const { default: axios } = require("axios");
const cheerio = require("cheerio");
const qs = require('qs')
const https = require('https')
const fs = require('fs').promises;
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { Bot, InputFile } = require('grammy');
const { exec } = require('child_process');
const { promisify } = require('util');

// Promisify exec for better async/await handling
const execPromise = promisify(exec);

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
        const movieName = title.split('|')[0].replace('DOWNLOAD ', '').replace('THENKIRI ', '').replace('THE NKIRI ', '').replace('NKIRI ', '').trim();

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

    return response.headers.location || response.headers['location'];

    // const final_download_page = response.data

    // let $ = cheerio.load(final_download_page)
    // let ddl = $('a:has(.downloadbtn)[href$=".mkv"], a:has(.downloadbtn)[href$=".mp4"]').attr("href");
    // return ddl

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
        const dir = path.resolve(__dirname, '..', '..', 'public', 'essentials');
        fs.mkdirSync(dir, { recursive: true }); // ensures folder exists

        const thumbPath = path.resolve(dir, 'thumb-movie.jpeg');

        // First attempt to send the document
        const documentResult = await bot.api.sendDocument(Number(process.env.OHMY_DB), new InputFile(destPath), {
            thumbnail: new InputFile(thumbPath),
            parse_mode: 'HTML',
            caption: fileCaption
        })
            .catch(error => {
                console.error('Document upload error:', error);
                throw new Error(`Failed to upload document: ${error.message}`);
            });

        if (!documentResult) {
            throw new Error('Document upload failed - no response received');
        }

        // Then attempt to send the photo
        await bot.api.sendPhoto(Number(process.env.MUVIKA_TRAILERS), imgUrl, {
            parse_mode: 'HTML',
            caption: photCaption
        }).catch(error => {
            console.error('Photo upload error:', error);
            // Don't throw here as the document upload succeeded
        });

        socket.emit('result', '✅ Finished uploading to Telegram');

        return {
            msgid: documentResult.message_id,
            uniqueId: documentResult.document?.file_unique_id,
            fileid: documentResult.document?.file_id
        };
    } catch (error) {
        console.error('Telegram upload error:', error);
        socket.emit('errorMessage', `Failed uploading to telegram... Error! ${error.message}`);
        throw error; // Re-throw to handle in the calling function
    }
};

// Helper function to download a file with progress tracking
const downloadFile = async (durl, socket, fileName, fileCaption, photCaption, imgUrl) => {
    const destPath = path.resolve(__dirname, '..', '..', 'storage', fileName);

    try {
        const response = await axios.get(durl, {
            responseType: 'stream',
            httpsAgent: new https.Agent({
                rejectUnauthorized: false,
                // Enable legacy SSL/TLS versions if needed
                secureProtocol: 'TLS_method',
                // Increase key size for better compatibility
                secureOptions: require('constants').SSL_OP_LEGACY_SERVER_CONNECT
            })
        });

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;
        let lastLogTime = Date.now();

        const writer = response.data.pipe(require('fs').createWriteStream(destPath));

        response.data.on('data', (chunk) => {
            downloadedSize += chunk.length;
            const now = Date.now();
            if (now - lastLogTime >= 1000) {
                const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
                const downloadedMB = (downloadedSize / 1024 / 1024).toFixed(2);
                const totalMB = (totalSize / 1024 / 1024).toFixed(2);
                socket.emit('result', `Downloaded: ${downloadedMB}MB of ${totalMB}MB (${progress}%)`);
                lastLogTime = now;
            }
        });

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        socket.emit('result', 'Download Finished. Generating metadata...');

        const isMKV = path.extname(fileName).toLowerCase() === '.mkv';

        if (isMKV) {
            await execPromise(`mkvpropedit "${destPath}" --edit info --set "title=Downloaded from MUVIKA ZONE"`);
            await execPromise(`mkvpropedit "${destPath}" --edit track:1 --set "name=Downloaded from MUVIKA ZONE"`);
        } else {
            await new Promise((resolve, reject) => {
                ffmpeg(destPath)
                    .outputOptions('-c', 'copy')
                    .outputOptions('-metadata', 'title=Downloaded from MUVIKA ZONE')
                    .saveToFile(`${destPath}.temp`)
                    .on('end', async () => {
                        await fs.rename(`${destPath}.temp`, destPath);
                        resolve();
                    })
                    .on('error', reject);
            });
        }

        socket.emit('result', 'Finished editing metadata. Uploading to telegram... ⏳');

        const telegram = await uploadingToTelegram(destPath, fileCaption, imgUrl, photCaption, socket);

        if (!telegram) {
            throw new Error('Failed to get Telegram upload response');
        }

        socket.emit('result', 'Finished uploading to Telegram. Saving to DB... ⏳');
        await fs.unlink(destPath);

        return { telegram };
    } catch (error) {
        socket.emit('errorMessage', `Download/upload process failed: ${error.message}`);
        // Clean up the downloaded file if it exists
        try {
            await fs.access(destPath);
            await fs.unlink(destPath);
        } catch (cleanupError) {
            // File doesn't exist or can't be accessed, ignore
            console.log('File cant be cleared. Not accessible')
        }
        throw error;
    }
};

// Copying telegram
const copyingTelegram = async (msgid) => {
    let bc = await bot.api.copyMessage(Number(process.env.BACKUP_CHANNEL), process.env.OHMY_DB, msgid)
    return bc.message_id
}

module.exports = { scrapeNkiriPage, GetDirectDownloadLink, downloadFile, copyingTelegram }