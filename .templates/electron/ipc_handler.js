const { ipcMain } = require('electron');
const path = require('path');
const log = require('electron-log');

// [TEMPLATE] Basic IPC Handler
// Copy this pattern for new features
function setupTemplateHandler(mainWindow) {
    ipcMain.handle('feature-name', async (event, args) => {
        try {
            log.info('Feature triggered');
            // Call Python or perform logic
            return { success: true };
        } catch (error) {
            log.error('Feature error:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = { setupTemplateHandler };
