const { default: axios } = require("axios");
const cheerio = require("cheerio");
const qs = require('qs');
const https = require('https');
const fs = require('fs').promises; // async
const fsSync = require('fs'); // for streams/stats
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { Bot, InputFile } = require('grammy');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

const bot = new Bot(process.env.BOT_TOKEN, {
    client: { apiRoot: process.env.API_ROOT }
});

// Ensure folder exists
async function ensureFolderExists(folderPath) {
    await fs.mkdir(folderPath, { recursive: true });
}

// Scraping functions
async function scrapeNkiriPage(url, socket) {
    try {
        const { data: html } = await axios.get(url);
        const $ = cheerio.load(html);
        const ogImage = $('meta[property="og:image"]').attr('content') || null;
        const downloadLink = $('article')
            .find('a.elementor-button')
            .filter((i, el) => $(el).text().trim().toLowerCase() === 'download movie')
            .attr('href') || null;

        let synopsisText = '';
        $('h2.elementor-heading-title').each((i, elem) => {
            if ($(elem).text().trim() === 'Synopsis') {
                const nextSection = $(elem).closest('section').next('section');
                synopsisText = nextSection.find('p').first().text();
            }
        });

        const title = $('title').text().trim();
        const movieName = title.split('|')[0].replace(/DOWNLOAD |THENKIRI |THE NKIRI |NKIRI /g, '').trim();

        return { ogImage, downloadLink, synopsisText, movieName };
    } catch (error) {
        socket.emit('errorMessage', error.message);
        console.error('Error while scraping:', error);
        return { ogImage: null, downloadLink: null, synopsis: null };
    }
}

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
            'Upgrade-Insecure-Requests': '1'
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        maxRedirects: 0,
        validateStatus: status => status >= 200 && status < 400
    });

    return response.headers.location || response.headers['location'];
};

async function GetDirectDownloadLink(url, socket) {
    try {
        let id = url.split('.com/')[1].split('/')[0].trim();
        let Origin = url.split('.com/')[0] + '.com';

        const formData = {
            op: 'download2',
            id,
            rand: '',
            referer: 'https://nkiri.com/',
            method_free: '',
            method_premium: ''
        };

        const durl = await reqEpisodeAxios(Origin, url, formData);
        return durl;
    } catch (error) {
        socket.emit('errorMessage', `Failed scraping direct movie url. Error! ${error.message}`);
        console.error('Error while scraping ddl:', error);
        return { durl: null };
    }
}

// ############################################################
// DOWNLOADING SECTION
// ############################################################

const uploadingToTelegram = async (destPath, fileCaption, imgUrl, photCaption, socket) => {
    try {
        const dir = path.resolve(__dirname, '..', '..', 'public', 'essentials');
        await ensureFolderExists(dir);

        const thumbPath = path.resolve(dir, 'thumb-movie.jpeg');

        const documentResult = await bot.api.sendDocument(Number(process.env.OHMY_DB), new InputFile(destPath), {
            thumbnail: new InputFile("https://res.cloudinary.com/daucejhsa/image/upload/v1769078594/thumb-movie_qfxwvt.jpg"),
            parse_mode: 'HTML',
            caption: fileCaption
        }).catch(error => {
            console.error('Document upload error:', error);
            throw new Error(`Failed to upload document: ${error.message}`);
        });

        if (!documentResult) throw new Error('Document upload failed - no response received');

        await bot.api.sendPhoto(Number(process.env.MUVIKA_TRAILERS), imgUrl, {
            parse_mode: 'HTML',
            caption: photCaption
        }).catch(() => {}); // ignore photo errors

        socket.emit('result', '✅ Finished uploading to Telegram');

        return {
            msgid: documentResult.message_id,
            uniqueId: documentResult.document?.file_unique_id,
            fileid: documentResult.document?.file_id
        };
    } catch (error) {
        socket.emit('errorMessage', `Failed uploading to telegram... Error! ${error.message}`);
        throw error;
    }
};

const downloadFile = async (durl, socket, fileName, fileCaption, photCaption, imgUrl) => {
    const destPath = path.resolve(__dirname, '..', '..', 'storage', fileName);
    await ensureFolderExists(path.dirname(destPath));

    try {
        const response = await axios.get(durl, { responseType: 'stream', httpsAgent: new https.Agent({ rejectUnauthorized: false }) });
        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;
        let lastLogTime = Date.now();

        const writer = fsSync.createWriteStream(destPath);
        response.data.pipe(writer);

        response.data.on('data', chunk => {
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
                    .outputOptions('-c', 'copy', '-metadata', 'title=Downloaded from MUVIKA ZONE')
                    .saveToFile(`${destPath}.temp`)
                    .on('end', async () => { await fs.rename(`${destPath}.temp`, destPath); resolve(); })
                    .on('error', reject);
            });
        }

        socket.emit('result', 'Finished editing metadata. Uploading to telegram... ⏳');
        const telegram = await uploadingToTelegram(destPath, fileCaption, imgUrl, photCaption, socket);

        await fs.unlink(destPath); // cleanup
        return { telegram };
    } catch (error) {
        socket.emit('errorMessage', `Download/upload process failed: ${error.message}`);
        try { await fs.unlink(destPath); } catch {}
        throw error;
    }
};

// Copying telegram
const copyingTelegram = async (msgid) => {
    const bc = await bot.api.copyMessage(Number(process.env.BACKUP_CHANNEL), process.env.OHMY_DB, msgid);
    return bc.message_id;
};

module.exports = { scrapeNkiriPage, GetDirectDownloadLink, downloadFile, copyingTelegram };
