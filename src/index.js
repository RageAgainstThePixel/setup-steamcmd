const path = require('path');
const core = require('@actions/core');
const tc = require('@actions/tool-cache');
const exec = require('@actions/exec');
const fs = require('fs').promises;

const steamcmd = 'steamcmd';
const IS_LINUX = process.platform === 'linux';
const IS_MAC = process.platform === 'darwin';
const IS_WINDOWS = process.platform === 'win32';
const toolExtension = IS_WINDOWS ? '.exe' : '.sh';
const toolPath = `${steamcmd}${toolExtension}`;

const main = async () => {
    try {
        core.info('Setting up steamcmd');
        await setup_steamcmd();
    } catch (error) {
        core.setFailed(error.message);
    }
};

main();

async function setup_steamcmd() {
    const tool = await findOrDownload();
    core.debug(`${steamcmd} -> ${tool}`);
    core.addPath(tool);
    core.exportVariable(steamcmd, tool);
    await exec.exec(tool, ['+help', '+info', '+quit']);
}

async function findOrDownload() {
    let toolDirectory = tc.find(steamcmd, '*');
    let tool = undefined;
    if (!toolDirectory) {
        const [url, archiveName] = getDownloadUrl();
        const archiveDownloadPath = path.resolve(getTempDirectory(), archiveName);
        core.debug(`Attempting to download ${steamcmd} from ${url} to ${archiveDownloadPath}`);
        const archivePath = await tc.downloadTool(url, archiveDownloadPath);
        core.debug(`Successfully downloaded ${steamcmd} to ${archivePath}`);
        core.debug(`Extracting ${steamcmd} from ${archivePath}`);
        let downloadDirectory = path.resolve(getTempDirectory(), steamcmd);
        if (IS_WINDOWS) {
            downloadDirectory = await tc.extractZip(archivePath, downloadDirectory);
        } else {
            downloadDirectory = await tc.extractTar(archivePath, downloadDirectory);
        }
        if (!downloadDirectory) {
            throw new Error(`Failed to extract ${steamcmd} from ${archivePath}`);
        }
        if (IS_LINUX || IS_MAC) {
            await exec.exec(`chmod +x ${downloadDirectory}`);
        }
        core.debug(`Successfully extracted ${steamcmd} to ${downloadDirectory}`);
        tool = getExecutable(downloadDirectory);
        if (IS_LINUX) {
            const binDir = path.resolve(downloadDirectory, 'bin');
            const binExe = path.resolve(binDir, steamcmd);
            await fs.mkdir(binDir);
            await fs.writeFile(binExe, `#!/bin/bash\nexec "${tool}" "$@"`);
            await fs.chmod(binExe, 0o755);
            tool = binExe;
        }
        const downloadVersion = await getVersion(tool);
        core.debug(`Setting tool cache: ${downloadDirectory} | ${steamcmd} | ${downloadVersion}`);
        toolDirectory = await tc.cacheDir(downloadDirectory, steamcmd, downloadVersion);
    }

    if (IS_LINUX) {
        tool = path.resolve(toolDirectory, 'bin', steamcmd);
    } else {
        tool = getExecutable(toolDirectory);
    }
    core.debug(`Found ${tool} in ${toolDirectory}`);
    return tool;
}

function getDownloadUrl() {
    let archiveName = undefined;
    switch (process.platform) {
        case 'linux':
            archiveName = 'steamcmd_linux.tar.gz';
            break;
        case 'darwin':
            archiveName = 'steamcmd_osx.tar.gz';
            break;
        case 'win32':
            archiveName = 'steamcmd.zip';
            break;
        default:
            throw new Error('Unsupported platform');
    }
    return [`https://steamcdn-a.akamaihd.net/client/installer/${archiveName}`, archiveName];
}

function getTempDirectory() {
    const tempDirectory = process.env['RUNNER_TEMP'] || ''
    return tempDirectory
}

function getExecutable(directory) {
    return path.resolve(directory, toolPath);
}

async function getVersion(path) {
    const semVerRegEx = 'Steam Console Client \\(c\\) Valve Corporation - version (?<version>\\d+)';
    let output = '';
    core.startGroup('steamcmd +quit');
    await exec.exec(path, '+quit', {
        listeners: {
            stdout: (data) => {
                output += data.toString();
            }
        },
        ignoreReturnCode: IS_WINDOWS,
        silent: !core.isDebug()
    });
    core.endGroup();
    const match = output.match(semVerRegEx);
    if (!match) {
        throw new Error('Failed to get version');
    }
    const version = match.groups.version
    if (!version) {
        throw new Error('Failed to parse version');
    }
    core.debug(`Found version: ${version}`);
    return version
}
