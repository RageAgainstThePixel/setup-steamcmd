const core = require('@actions/core');
const logging = require('./logging');
const setup = require('./setup');

const IsPost = !!core.getState('isPost');

const main = async () => {
    try {
        if (!IsPost) {
            core.info(`Setting up steamcmd...`);
            core.saveState('isPost', 'true');
            await setup.SteamCmd();
        } else {
            core.info('Dumping steamcmd logs...');
            await logging.PrintLogs(process.env.STEAM_TEMP);
            await logging.PrintLogs(process.env.STEAM_CMD, true);
        }
    } catch (error) {
        core.setFailed(error);
    }
};

main();
