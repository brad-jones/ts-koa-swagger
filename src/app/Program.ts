import 'reflect-metadata';
import * as fs from 'mz/fs';
import { Server } from 'http';
import { config as dotenv } from 'dotenv';
import { BuildContainer } from 'app/Container';

(async () =>
{
    // Load up any pseudo environment variables
    // We look in three places, the current working directory,
    // the location of this actual script, or one level above.
    if (await fs.exists(process.cwd() + '/.env'))
    {
        dotenv({ path: process.cwd() + '/.env' });
    }
    else if (await fs.exists(__dirname + '/.env'))
    {
        dotenv({ path: __dirname + '/.env' });
    }
    else
    {
        dotenv({ path: __dirname + '/../.env' });
    }

    // Build the root container.
    let container = BuildContainer();

    // Resolve the http server
    let server = container.get(Server);

    // Grab the host and port from our environment
    let host = process.env['KOA_HOST'];
    let port = parseInt(process.env['KOA_PORT']);

    // Start listening
    server.listen(port, host);
    console.log(`Listening on http://${host}:${port}\n`);
})()
.catch(e =>
{
    console.error(e);
    process.exit(1);
});
