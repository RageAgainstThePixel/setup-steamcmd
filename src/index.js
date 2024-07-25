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
    const [tool, toolDirectory] = await findOrDownload();
    core.debug(`${steamcmd} -> ${tool}`);
    core.addPath(path.dirname(tool));
    core.exportVariable(steamcmd, tool);
    await exec.exec(tool, ['+help', '+quit']);
}

async function findOrDownload() {
    let toolDirectory = tc.find(steamcmd, '*');
    if (!toolDirectory) {
        const [url, archiveName] = getDownloadUrl();
        const archiveDownloadPath = path.resolve(getTempDirectory(), archiveName);
        core.debug(`Attempting to download ${steamcmd} from ${url} to ${archiveDownloadPath}`);
        const archivePath = await tc.downloadTool(url, archiveDownloadPath);
        core.debug(`Successfully downloaded ${steamcmd} to ${archivePath}`);
        core.debug(`Extracting ${steamcmd} from ${archivePath}`);
        toolDirectory = path.resolve(getTempDirectory(), steamcmd);
        if (IS_WINDOWS) {
            toolDirectory = await tc.extractZip(archivePath, toolDirectory);
        } else {
            toolDirectory = await tc.extractTar(archivePath, toolDirectory);
        }
        if (!toolDirectory) {
            throw new Error(`Failed to extract ${steamcmd} from ${archivePath}`);
        }
        if (IS_LINUX || IS_MAC) {
            const extractedPath = path.resolve(toolDirectory, steamcmd);
            await exec.exec(`chmod +x ${extractedPath}`);
            core.debug(`Set executable permissions for ${extractedPath}`);
        }
        core.debug(`Successfully extracted ${steamcmd} to ${toolDirectory}`);
        const tool = getExecutable(toolDirectory);
        const downloadVersion = await getVersion(tool);
        core.debug(`Setting tool cache: ${toolDirectory} | ${steamcmd} | ${downloadVersion}`);
        toolDirectory = await tc.cacheDir(toolDirectory, steamcmd, downloadVersion);
    }

    const tool = getExecutable(toolDirectory);
    if (IS_LINUX) {
        const binDir = path.resolve(toolDirectory, 'bin');
        const binExe = getExecutable(binDir);
        core.debug(`Creating bin directory: ${binDir}`);
        await fs.mkdir(binDir, { recursive: true });
        await fs.writeFile(binExe, `#!/bin/bash\nexec "${tool}" "$@"`);
        await fs.chmod(binExe, 0o755);
        core.debug(`Created and set permissions for bash wrapper: ${binExe}`);
    }

    core.debug(`Found ${steamcmd} tool at ${toolDirectory}`);
    return [getExecutable(toolDirectory), toolDirectory];
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

async function getVersion(tool) {
    const semVerRegEx = /Steam Console Client \(c\) Valve Corporation - version (?<version>\d+)/;
    let output = '';
    core.startGroup('steamcmd +quit');
    await exec.exec(tool, ['+quit'], {
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
    if (!match || !match.groups.version) {
        throw new Error('Failed to get version');
    }
    const version = match.groups.version;
    core.debug(`Found version: ${version}`);
    return version;
}