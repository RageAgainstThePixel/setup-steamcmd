const semver = require('semver');
const path = require('path');
const core = require('@actions/core');
const tc = require('@actions/tool-cache');
const exec = require('@actions/exec');

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
    const [tool, toolDirectory] = await findOrDownload();
    core.debug(`${steamcmd} -> ${tool}`);
    core.addPath(toolDirectory);
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
        let downloadDirectory = undefined;
        if (IS_WINDOWS) {
            downloadDirectory = await tc.extractZip(archivePath, steamcmd);
        } else {
            downloadDirectory = await tc.extractTar(archivePath, steamcmd);
        }
        if (!downloadDirectory) {
            throw new Error(`Failed to extract ${steamcmd}`);
        }
        if (IS_LINUX || IS_MAC) {
            await exec.exec(`chmod +x ${downloadDirectory}`);
        }
        core.debug(`Successfully extracted ${steamcmd} to ${downloadDirectory}`);
        tool = getExecutable(downloadDirectory);
        const downloadVersion = await getVersion(tool);
        core.debug(`Setting tool cache: ${downloadDirectory} | ${toolPath} | ${steamcmd} | ${downloadVersion}`);
        toolDirectory = await tc.cacheDir(downloadDirectory, toolPath, steamcmd, downloadVersion);
    }

    tool = getExecutable(toolDirectory);
    core.debug(`Found ${steamcmd} at ${toolDirectory}`);
    return [tool, toolDirectory];
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
    const semVerRegEx = new RegExp(/([0-9]+)\.([0-9]+)\.([0-9]+)\.([0-9]+)?/);
    let output = '';
    await exec.exec(path, 'version', {
        listeners: {
            stdout: (data) => {
                output += data.toString();
            }
        }
    });
    const match = output.match(semVerRegEx)[0];
    if (!match) {
        throw Error("Failed to find a valid version match");
    }
    const lastPeriodIndex = match.lastIndexOf('.');
    const semVerStr = match.substring(0, lastPeriodIndex) + '+' + match.substring(lastPeriodIndex + 1);
    const version = semver.clean(semVerStr);
    if (!version) {
        throw Error("Failed to find a valid version");
    }
    return version
}
