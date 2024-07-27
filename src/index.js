const path = require('path');
const core = require('@actions/core');
const tc = require('@actions/tool-cache');
const exec = require('@actions/exec');
const fs = require('fs').promises;

const steamcmd = 'steamcmd';
const STEAM_CMD = 'STEAM_CMD';
const IS_LINUX = process.platform === 'linux';
const IS_MAC = process.platform === 'darwin';
const IS_WINDOWS = process.platform === 'win32';
const toolExtension = IS_WINDOWS ? '.exe' : '.sh';
const toolPath = `${steamcmd}${toolExtension}`;

const main = async () => {
    try {
        core.info('Setting up steamcmd...');
        await setup_steamcmd();
    } catch (error) {
        core.setFailed(error.message);
    }
};

main();

async function setup_steamcmd() {
    const [toolDirectory, steamDir] = await findOrDownload();
    core.debug(`${STEAM_CMD} -> ${toolDirectory}`);
    core.addPath(toolDirectory);
    if (IS_LINUX) {
        const toolRootDirectory = path.resolve(toolDirectory, '..');
        core.exportVariable(STEAM_CMD, toolRootDirectory);
    } else {
        core.exportVariable(STEAM_CMD, toolDirectory);
    }
    core.exportVariable('STEAM_DIR', steamDir);
    await exec.exec(steamcmd, ['+help', '+quit']);
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
        toolDirectory = path.resolve(toolDirectory, 'bin');
    } else {
        tool = getExecutable(toolDirectory);
    }
    core.debug(`Found ${tool} in ${toolDirectory}`);
    const steamDir = getSteamDir(toolDirectory);
    return [toolDirectory, steamDir];
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
    await exec.exec(path, '+quit', {
        listeners: {
            stdout: (data) => {
                output += data.toString();
            }
        },
        ignoreReturnCode: IS_WINDOWS,
        silent: !core.isDebug()
    });
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

function getSteamDir(toolDirectory) {
    let steamDir = undefined;
    switch (process.platform) {
        case 'linux':
            steamDir = '/home/runner/Steam';
            break;
        case 'darwin':
            steamDir = '/Users/runner/Library/Application Support/Steam';
            break;
        default:
            steamDir = toolDirectory;
            break;
    }
    // check if steam directory exists and create if not
    try {
        fs.access(steamDir);
    } catch (error) {
        if (error.code === 'ENOENT') {
            core.debug(`Creating steam directory: ${steamDir}`);
            fs.mkdir(steamDir);
        } else {
            throw error;
        }
    }
    core.debug(`Steam directory: ${steamDir}`);
    return steamDir;
}
