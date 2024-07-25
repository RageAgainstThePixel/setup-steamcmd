const os = require('os');
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
    const pathToToolDir = await findOrDownload();
    const tool = getExecutable(pathToToolDir);
    core.debug(`${steamcmd} -> ${tool}`);
    core.addPath(pathToToolDir);
    core.exportVariable(steamcmd, tool);
    await exec.exec(tool, ['+help', '+info', '+quit']);
}

async function findOrDownload() {
    let pathToToolDir = tc.find(steamcmd, '*');

    if (!pathToToolDir) {
        const url = getDownloadUrl();
        let downloadPath = path.resolve(getTempDirectory(), toolPath);
        core.debug(`Attempting to download ${steamcmd} from ${url} to ${downloadPath}`);
        downloadPath = await tc.downloadTool(url, downloadPath);
        core.debug(`Successfully downloaded ${steamcmd} to ${downloadPath}`);

        if (IS_MAC || IS_LINUX) {
            await exec.exec(`chmod +x ${downloadPath}`);
        }

        const downloadVersion = await getVersion(downloadPath);
        core.debug(`Setting tool cache: ${downloadPath} | ${toolPath} | ${steamcmd} | ${downloadVersion}`);
        pathToToolDir = await tc.cacheFile(downloadPath, toolPath, steamcmd, downloadVersion);
    }

    core.debug(`Found ${steamcmd} at ${pathToToolDir}`);
    return pathToToolDir;
}

function getDownloadUrl() {
    switch (process.platform) {
        case 'linux':
            return 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz';
        case 'darwin':
            return 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_osx.tar.gz';
        case 'win32':
            return 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip';
        default:
            throw new Error('Unsupported platform');
    }
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
