const core = require('@actions/core');
const fs = require('fs/promises');
const path = require('path');
const excludedPaths = ['steambootstrapper', 'appcache', 'steamapps'];

async function PrintLogs(directory, clear = false) {
    core.info(directory);
    try {
        const files = await fs.readdir(directory, { recursive: true });
        for (const file of files) {
            try {
                const fullPath = path.join(directory, file);
                const stat = await fs.stat(fullPath);
                if (!stat.isFile()) { continue; }
                if (!/\.(log|txt|vdf)$/.test(file)) { continue }
                if (excludedPaths.some(excluded => fullPath.includes(excluded))) { continue; }
                const fileHandle = await fs.open(fullPath, 'r');
                const logContent = await fs.readFile(fileHandle, 'utf8');
                core.info(`::group::${file}`);
                core.info(logContent);
                core.info('::endgroup::');
                if (clear && fullPath.includes('logs')) {
                    await fs.unlink(fullPath);
                }
            } catch (error) {
                core.error(`Failed to read log: ${path}\n${error.message}`);
            }
        }
    } catch (error) {
        core.error(`Failed to read logs in ${directory}!\n${error.message}`);
    }
}

module.exports = { PrintLogs }
