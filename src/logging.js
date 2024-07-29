const core = require('@actions/core');
const fs = require('fs/promises');

async function PrintLogs(directory, clear = false) {
    core.info(directory);
    try {
        const logs = await fs.readdir(directory, { recursive: true });
        for (const log of logs) {
            try {
                const path = `${directory}/${log}`;
                const stat = await fs.stat(path);
                if (!stat.isFile()) { continue; }
                if (!/\.(log|txt|vdf)$/.test(log)) { continue }
                const logContent = await fs.readFile(path, 'utf8');
                core.info(`::group::${log}`);
                core.info(logContent);
                core.info('::endgroup::');
                if (clear) {
                    await fs.unlink(path);
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
