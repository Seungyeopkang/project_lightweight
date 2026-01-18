const { _electron: electron } = require('playwright');
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test('Automated Pruning: Should fail (Reproduction)', async () => {
    test.setTimeout(60000);
    // 1. Setup - Launch App
    const electronApp = await electron.launch({ args: ['.'] });
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // 2. Upload Dummy Model (We need a real file for the test to work, use a small valid ONNX if possible or mock)
    // Since we don't have a small ONNX handy, we might need to mock the upload or expect failure earlier.
    // However, the rule "reproduce bug" implies we need to trigger the actual failure.
    // Let's assume user has 'model.onnx' in root as per README.

    const modelPath = path.join(__dirname, '../../model.onnx');
    if (!fs.existsSync(modelPath)) {
        console.log('Skipping test: model.onnx not found. Please provide a test model.');
        return;
    }

    // Trigger Upload (Mocking file selection via IPC is hard without custom code, 
    // but we can invoke the backend API directly via electronAPI if exposed, 
    // OR just verify the frontend UI flow).

    // For reproduction, calling the IPC directly is more reliable to test the "Bridge".

    // Evaluate in context
    const result = await window.evaluate(async (path) => {
        return await window.electronAPI.uploadModel(path);
    }, modelPath);

    expect(result.session_id).toBeTruthy();
    const sessionId = result.session_id;

    // 3. UI Interaction Test (Spying on API)
    // We need to verify that 'saveFile' and 'writeFile' are called after pruning.

    // Mock the electronAPI in the page context to spy on calls
    await window.evaluate(() => {
        window.electronAPI.originalPrune = window.electronAPI.pruneModel;
        window.electronAPI.originalSave = window.electronAPI.saveFile;
        window.electronAPI.originalWrite = window.electronAPI.writeFile;

        window.callHistory = { saveFile: 0, writeFile: 0 };

        window.electronAPI.pruneModel = async (...args) => {
            // Mock success response from backend
            window.callHistory.pruneArgs = args;
            return { success: true, data: { stats: { pruning_ratio: 0.3 }, data: 'base64_mock_data', filename: 'test_pruned.onnx' } };
        };

        window.electronAPI.saveFile = async (name) => {
            window.callHistory.saveFile++;
            return { canceled: false, filePath: 'C:\\fake\\path.onnx' };
        };

        window.electronAPI.writeFile = async (path, data) => {
            window.callHistory.writeFile++;
            return { success: true };
        };
    });

    // Valid pruning flow:
    // 1. User clicks "Apply Pruning" (We simulate this by calling handlePrune indirectly or just invoking the logic?)
    // Actually, since we can't easily click if the model isn't loaded in UI state, 
    // let's manually invoke the component logic or simulate the full flow.
    // If we uploaded properly in Step 2, the UI should be in "Model Loaded" state.

    // Select method and click prune
    const pruneBtn = window.locator('button:has-text("Apply Pruning")');
    if (await pruneBtn.isVisible()) {
        await pruneBtn.click();
    } else {
        console.log('Prune button not visible, attempting to force state via store?');
        // If we can't click, we might fail. 
        // But let's assume valid flow for now.
    }

    // Wait for async operations
    await page.waitForTimeout(2000);

    // Assert that saveFile was called
    const history = await window.evaluate(() => window.callHistory);
    console.log('API Call History:', history);

    expect(history.saveFile).toBeGreaterThan(0);
    expect(history.writeFile).toBeGreaterThan(0);
});
