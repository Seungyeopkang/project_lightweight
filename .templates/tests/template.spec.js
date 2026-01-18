const { test, expect } = require('@playwright/test');

// [TEMPLATE] E2E Test
// Copy this pattern for new feature tests

test('Feature Name: Basic Interaction', async ({ page, electronApp }) => {
    // 1. Setup
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // 2. Action
    await window.click('#feature-button');

    // 3. Verification
    const result = await window.locator('#result-area');
    await expect(result).toBeVisible();
    await expect(result).toContainText('Success');
});
