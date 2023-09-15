import Parser from 'rss-parser';
import path, { resolve } from 'path';
import { downloadFile, processDownloadedFile } from '../../utils/utils';
import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        let searchPhrase = req.query.searchPhrase as string | undefined;
        const rssUrl = req.query.rssUrl as string | undefined;

        if (!searchPhrase || !rssUrl) {
            res.status(500).json({ error: 'Required parameters are not set' });
            return;
        }

        // Prepend '#' to searchPhrase if it's a number
        if (!isNaN(Number(searchPhrase))) {
            searchPhrase = '#' + searchPhrase;
        }

        const parser = new Parser();
        const feed = await parser.parseURL(rssUrl);

        const items = feed.items.filter(item => (" " + item.title + " ").includes(" " + searchPhrase + " "));

        if (items.length > 0) {
            const protocol = req.headers['x-forwarded-proto'] || 'http';
            const host = req.headers['host'];
            const baseUrl = `${protocol}://${host}`;

            if (items.length === 1) {
                const item = items[0];
                const mp3Url = item.enclosure ? item.enclosure.url : null;
                const splitUrl = mp3Url ? mp3Url.split('/') : null;
                const lastPartOfUrl = splitUrl ? splitUrl.pop() : null;
                const fileName = lastPartOfUrl ? lastPartOfUrl.split('.')[0] : null;
                const pathToFile = fileName ? resolve(process.cwd(), './public/audio', `${fileName}.mp3`) : null;
                const finalJsonFolder = fileName ? path.resolve('./public/json', fileName) : null;

                res.status(200).json({
                    mp3Url: fileName ? `${baseUrl}/audio/${fileName}.mp3` : null,
                    jsonUrl: fileName ? `${baseUrl}/json/${fileName}/${fileName}.json` : null
                });

                if (mp3Url && pathToFile && finalJsonFolder) {
                    try {
                        await downloadFile(mp3Url, pathToFile);
                        await processDownloadedFile(pathToFile, finalJsonFolder);
                    } catch (error) {
                        console.error(`Error during download: ${error}`);
                    }
                }
            } else {
                const results = items.map(item => ({ title: item.title }));
                res.status(200).json(results);
            }
        } else {
            res.status(404).json({ error: 'No matching items found in the RSS feed' });
        }
    } else {
        res.status(405).json({ message: 'Method not allowed' });
    }
}