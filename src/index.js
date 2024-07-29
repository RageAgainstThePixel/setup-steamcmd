const core = require('@actions/core');
const logging = require('./logging');
const setup = require('./setup');

const IsPost = !!core.getState('isPost');

const main = async () => {
    if (!IsPost) {
        core.saveState('isPost', 'true');
        core.info('Setup steamcmd...');
        try {
            await setup.Run();
        } catch (error) {
            core.setFailed(error);
        }
    } else {
        core.info('Dumping steamcmd logs...');
        await logging.PrintLogs(process.env.STEAM_TEMP);
        await logging.PrintLogs(process.env.STEAM_CMD, true);
    }
}

main();
