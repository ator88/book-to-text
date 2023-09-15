import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path, { resolve } from 'path';
import { downloadFile, processDownloadedFile, downloadBook, convertAndUploadAAX } from '../../utils/utils';

process.env.PATH = process.env.PATH + ':/path/to/whisperx';

const email = process.env.EMAIL;
const password = process.env.PASSWORD;
const activationBytes = process.env.ACTIVATION_BYTES;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        const bookTitle = req.query.bookTitle as string | undefined;
        const mp3Url = req.query.mp3Url as string | undefined;

        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers['host'];
        const baseUrl = `${protocol}://${host}`;

        if (!email || !password || !activationBytes) {
            res.status(500).json({ error: 'Required environment variables are not set' });
            return;
        }

        if (mp3Url) {
            const fileName = mp3Url.split('/').pop()?.split('.')[0];
            if (!fileName) {
                res.status(400).json({ error: 'Invalid mp3Url' });
                return;
            }
            const pathToFile = resolve(process.cwd(), './public/audio', `${fileName}.mp3`);
            const finalJsonFolder = path.resolve('./public/json', fileName);

            res.status(200).json({ mp3Url: `${baseUrl}/audio/${fileName}.mp3`, jsonUrl: `${baseUrl}/json/${fileName}/${fileName}.json` });

            try {
                await downloadFile(mp3Url, pathToFile);
                await processDownloadedFile(pathToFile, finalJsonFolder);
            } catch (error) {
                console.error(`Error during download: ${error}`);
            }
        } else if (bookTitle) {
            const fileName = bookTitle.replace(/ /g, '_');
            const aarPath = resolve(process.cwd(), './public/aar', `${fileName}.aax`);
            const mp3Url = `${baseUrl}/audio/${fileName}.mp3`;
            const jsonUrl = `${baseUrl}/json/${fileName}/${fileName}.json`;

            res.status(200).json({ mp3Url, jsonUrl });

            if (fs.existsSync(aarPath)) {
                console.log('Using local AAX file for testing');
                console.log('Starting conversion...');
                await convertAndUploadAAX(aarPath, fileName, baseUrl, activationBytes);
                console.log('Conversion finished');
            } else {
                try {
                    const { browser } = await downloadBook(email, password, bookTitle, aarPath, async () => {
                        console.log('Starting conversion...');
                        await convertAndUploadAAX(aarPath, fileName, baseUrl, activationBytes);
                        console.log('Conversion finished');
                        await browser.close();
                    });
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            }
        } else {
            res.status(400).json({ error: 'Either bookTitle or mp3Url is required' });
        }
    } else {
        res.status(405).json({ message: 'Method not allowed' });
    }
}