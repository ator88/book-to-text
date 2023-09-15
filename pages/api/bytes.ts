import { downloadBook } from '../../utils/utils';
import fs from 'fs';
import path, { resolve } from 'path';
import type { NextApiRequest, NextApiResponse } from 'next'
import { exec } from 'child_process';
import os from 'os'

const email = process.env.EMAIL;
const password = process.env.PASSWORD;

async function runFfprobe(pathToFile: string) {
    const command = `ffprobe "${pathToFile}"`;
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            const match = stderr.match(/file checksum == (\w+)/);
            const key = match ? match[1] : null;
            resolve(key);
        });
    });
}

async function runRcrack(key: string) {
    let rcrackPath: string;
    let command: string;

    if (os.platform() === 'win32') {
        // Windows
        rcrackPath = path.resolve(process.cwd(), './public/tables-master/run/rcrack.exe');
        command = `${rcrackPath} . -h ${key}`;
    } else {
        // Linux
        rcrackPath = path.resolve(process.cwd(), './public/tables-master/run/rcrack');
        command = `wine ${rcrackPath} . -h ${key}`;
    }

    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            const match = stdout.match(/hex:(\w+)/);
            const key = match ? match[1] : null;

            if (key) {
                const envFilePath = path.resolve(process.cwd(), '.env.local');
                let envFileContent = fs.readFileSync(envFilePath, 'utf8');
                envFileContent = envFileContent.replace(/(ACTIVATION_BYTES=).*/, `$1${key}`);
                fs.writeFileSync(envFilePath, envFileContent);
            }

            resolve(key);
        });
    });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        const bookTitle = req.query.bookTitle as string | undefined;

        if (!email || !password || !bookTitle) {
            res.status(500).json({ error: 'Required parameters are not set' });
            return;
        }

        const fileName = bookTitle.replace(/ /g, '_');
        const aarPath = resolve(process.cwd(), './public/aar', `${fileName}.aax`);

        try {
            const { browser, page } = await downloadBook(email, password, bookTitle, aarPath, async () => {
                const key = await runFfprobe(aarPath);
                if (key) {
                    await runRcrack(key as string);
                    // Close the browser after the download and extraction processes are complete
                    await browser.close();
                    res.write('Extracting activation bytes complete');
                    res.end();
                } else {
                    res.status(500).json({ error: 'Key extraction failed' });
                    return;
                }
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    } else {
        res.status(405).json({ message: 'Method not allowed' });
    }
}