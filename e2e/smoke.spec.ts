import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

test('renders the authentication gate without missing icon requests', async ({ page }) => {
  const missing: string[] = [];
  page.on('response', (response) => {
    if (response.status() === 404) missing.push(response.url());
  });
  await page.goto('/');
  await expect(page.locator('.language-select')).toHaveValue('cs');
  await page.locator('.language-select').selectOption('en');
  await expect(page.locator('#login-overlay')).toBeVisible();
  await expect(page.getByLabel('PROXY', { exact: true })).toHaveCount(0);
  const passwordInput = page.getByLabel('PASS', { exact: true });
  await passwordInput.fill('secret');
  await page.getByRole('button', { name: 'SHOW PASSWORD' }).click();
  await expect(passwordInput).toHaveAttribute('type', 'text');
  await expect(passwordInput).toHaveValue('secret');
  await page.getByRole('button', { name: 'HIDE PASSWORD' }).click();
  await expect(passwordInput).toHaveAttribute('type', 'password');
  const loginButton = page.getByRole('button', { name: 'LOGIN' });
  await expect(loginButton).toBeVisible();
  const initialLoginPosition = await loginButton.boundingBox();
  const viewport = page.viewportSize();
  expect(initialLoginPosition).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(
    viewport!.height - initialLoginPosition!.y - initialLoginPosition!.height
  ).toBeLessThan(70);
  const productionButton = page.getByRole('button', { name: 'PRODUCTION' });
  await expect(productionButton).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(productionButton).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(productionButton).toHaveCSS('border-color', 'rgb(255, 255, 255)');
  const primaryBlue = await loginButton.evaluate(
    (button) => getComputedStyle(button).backgroundColor
  );
  const testButton = page.getByRole('button', { name: 'TEST' });
  await testButton.click();
  await expect(testButton).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(testButton).toHaveCSS('border-color', primaryBlue);
  await expect(testButton).toHaveCSS('color', primaryBlue);
  await expect(page.locator('.login-logo-img')).toHaveAttribute(
    'src',
    /icon_darkmode\.svg/
  );
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  const lightPrimaryBlue = await loginButton.evaluate(
    (button) => getComputedStyle(button).backgroundColor
  );
  await expect(testButton).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(testButton).toHaveCSS('border-color', lightPrimaryBlue);
  await expect(testButton).toHaveCSS('color', lightPrimaryBlue);
  await productionButton.click();
  await expect(productionButton).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(productionButton).toHaveCSS('border-color', 'rgb(0, 0, 0)');
  await expect(productionButton).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(page.locator('.login-logo-img')).toHaveAttribute(
    'src',
    /icon_lightmode\.svg/
  );
  const finalLoginPosition = await loginButton.boundingBox();
  expect(finalLoginPosition).not.toBeNull();
  expect(Math.abs(finalLoginPosition!.y - initialLoginPosition!.y)).toBeLessThan(1);
  expect(missing).toEqual([]);
});

test('offers to apply an unfinished prior-day log without mixing it into today', async ({ page }) => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const previousDate = [
    yesterday.getFullYear(),
    String(yesterday.getMonth() + 1).padStart(2, '0'),
    String(yesterday.getDate()).padStart(2, '0')
  ].join('-');

  await page.addInitScript((date) => {
    localStorage.setItem('gl5', JSON.stringify({
      schemaVersion: 1,
      language: 'en',
      date,
      dayFinalized: false,
      dayPlanes: ['OK-OLD'],
      dayPilots: ['Old Pilot'],
      presetInitialized: true,
      recentConfigs: [{ id: 'old-config', ts: Date.now() - 86_400_000 }],
      log: [{
        id: 'old-flight',
        num: 1,
        date,
        toTime: '10:00',
        fn: 'glider',
        reg: 'OK-OLD',
        acType: 'ASK-21',
        pilots: ['Old Pilot'],
        ldgTime: '10:30',
        dur: '00:30',
        note: '',
        pair: null
      }]
    }));
  }, previousDate);

  let requestedDate = '';
  await page.route('https://klubko-proxy.onrender.com/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/get-flights-of-day/')) {
      requestedDate = url.searchParams.get('date') || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'OK', flights: [] })
      });
      return;
    }
    const isReference = [
      '/airplanes/',
      '/persons/',
      '/tasks/',
      '/airplane-takeoff-types/'
    ].some((suffix) => url.pathname.endsWith(suffix));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isReference ? { status: 'OK', data: [] } : { status: 'OK' })
    });
  });

  await page.goto('/');
  await page.locator('input[autocomplete="username"]').fill('tester');
  await page.locator('input[type="password"]').fill('secret');
  await page.getByRole('button', { name: 'LOGIN' }).click();

  const reminder = page.locator('#unapplied-log-modal');
  await expect(reminder).toBeVisible();
  await expect(reminder).toContainText('UNAPPLIED FLIGHT LOG');
  await expect(reminder).toContainText(previousDate);
  await expect(reminder.getByRole('button', { name: 'EXPORT PDF' })).toBeVisible();
  await reminder.getByRole('button', { name: 'PUSH TO KLUBKO' }).click();
  await expect(page.locator('#api-push-modal')).toBeVisible();
  expect(requestedDate).toBe(previousDate);
  await page.getByRole('button', { name: 'PUSH ALL (1)' }).click();
  await expect(reminder).toHaveCount(0);

  await page.getByRole('button', { name: /LOG/ }).first().click();
  await expect(page.locator('#log-overlay tbody tr')).toHaveCount(0);
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('gl5') || '{}'));
  expect(persisted.dayPlanes).toEqual([]);
  expect(persisted.dayPilots).toEqual([]);
  expect(persisted.recentConfigs).toEqual([]);
  expect(persisted.pendingLogs).toEqual([]);
});

test('logs an aerotow through landing and restores the daily log', async ({ page }) => {
  await page.route('https://raw.githubusercontent.com/google/fonts/**', async (route) => {
    await route.fulfill({
      path: path.resolve(
        'node_modules/playwright-core/lib/vite/traceViewer/codicon.DCmgc-ay.ttf'
      ),
      contentType: 'font/ttf'
    });
  });
  await page.route('https://klubko-proxy.onrender.com/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = { status: 'OK' };
    if (path.endsWith('/airplanes/')) {
      body = {
        status: 'OK',
        data: [
          { registration: 'OK-TOW', type: 'Z-226', seats: 1 },
          { registration: 'OK-GLI', type: 'ASK-21', seats: 2 }
        ]
      };
    } else if (path.endsWith('/persons/')) {
      body = {
        status: 'OK',
        data: [
          { first_name: 'Tow', last_name: 'Pilot' },
          { first_name: 'Glider', last_name: 'Pilot' },
          '+1 osoba'
        ]
      };
    } else if (path.endsWith('/tasks/')) {
      body = { status: 'OK', data: [] };
    } else if (path.endsWith('/airplane-takeoff-types/')) {
      body = { status: 'OK', data: { TOW: 'MA', GLI: 'AW' } };
    } else if (path.endsWith('/edit-flights/')) {
      body = { status: 'OK', flights: [{ status: 'OK' }] };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body)
    });
  });

  const login = async () => {
    await page.locator('.language-select').selectOption('en');
    await page.locator('input[autocomplete="username"]').fill('tester');
    await page.locator('input[type="password"]').fill('secret');
    await page.getByRole('button', { name: 'LOGIN' }).click();
    await expect(page.locator('#app')).toBeVisible();
  };

  await page.goto('/');
  await login();

  await page.locator('#hdr .hdr-btn').click();
  await page.getByRole('button', { name: 'MANAGE PLANES' }).click();
  await page.getByRole('button', { name: 'ADD ALL' }).click();
  await page.getByRole('button', { name: 'DONE' }).click();
  await page.getByRole('button', { name: 'MANAGE PILOTS' }).click();
  await page.getByRole('button', { name: 'ADD ALL' }).click();
  await page.getByRole('button', { name: 'DONE' }).click();
  await page.getByRole('button', { name: 'DONE' }).click();

  await page.getByRole('button', { name: /SELECT TOWPLANE/ }).click();
  await page.getByRole('button', { name: /OK-TOW/ }).click();
  await page.getByRole('button', { name: /Tow Pilot/ }).click();
  await page.getByRole('button', { name: /OK-GLI/ }).click();
  const passengerAsPic = page.getByRole('button', { name: /\+1 osoba/ });
  await expect(passengerAsPic).toBeDisabled();
  await expect(passengerAsPic).toContainText('PASSENGER ONLY');
  await page.getByRole('button', { name: /Glider Pilot/ }).click();
  const passengerInSeatTwo = page.getByRole('button', { name: /\+1 osoba/ });
  await expect(passengerInSeatTwo).toBeEnabled();
  await passengerInSeatTwo.click();
  await expect(page.locator('.btn-log.takeoff .clock-colon')).toHaveText(':');
  await expect(page.locator('.btn-log.takeoff .clock-colon')).toHaveCSS(
    'animation-name',
    'clockColonBlink'
  );
  await page.getByRole('button', { name: /LOG TAKEOFF/ }).click();

  await expect(page.locator('#airborne-scroll')).toContainText('OK-TOW');
  await expect(page.locator('#airborne-scroll')).toContainText('OK-GLI');

  await page.locator('.abn-row').filter({ hasText: 'OK-TOW' }).click();
  await expect(page.locator('.btn-log.land .clock-colon')).toHaveCSS(
    'animation-name',
    'clockColonBlink'
  );
  await page.getByRole('button', { name: /LOG LANDING/ }).click();
  await page.locator('.abn-row').filter({ hasText: 'OK-GLI' }).click();
  await page.getByRole('button', { name: /LOG LANDING/ }).click();
  await expect(page.locator('#airborne-scroll')).toContainText('NO FLIGHTS AIRBORNE');

  await page.getByRole('button', { name: /LOG/ }).first().click();
  await expect(page.locator('#log-overlay tbody')).toContainText('OK-TOW');
  await expect(page.locator('#log-overlay tbody')).toContainText('OK-GLI');
  await page.getByRole('button', { name: 'EDIT' }).click();
  await expect(page.getByRole('button', { name: /EXPORT/ })).toHaveCount(0);
  const returnAirborneButton = page.getByRole('button', { name: /RETURN AIRBORNE/ });
  await returnAirborneButton.click();
  await expect(page.locator('#log-overlay')).toHaveClass(/reopen-picking/);
  const warningColor = await returnAirborneButton.evaluate(
    (button) => getComputedStyle(button).backgroundColor
  );
  await expect(page.locator('#log-overlay')).toHaveCSS('border-color', warningColor);
  await expect(page.locator('.log-filter-bar')).toHaveCount(0);
  await expect(page.locator('.log-stats')).toHaveCount(0);
  const towLogRow = page.locator('#log-overlay tbody tr').filter({ hasText: 'OK-TOW' });
  const recalledLandingTime = await towLogRow.locator('td').nth(6).innerText();
  await towLogRow.click();
  await expect(towLogRow).toHaveClass(/reopen-selected/);
  await expect(page.getByRole('alertdialog')).toContainText('ARE YOU SURE?');
  await expect(page.getByRole('alertdialog')).toContainText(
    'This will recall the logged landing time'
  );
  await expect(page.getByRole('alertdialog')).toContainText(recalledLandingTime);
  await page.locator('.reopen-confirm-submit').click();
  await expect(page.locator('#log-overlay')).toHaveCount(0);
  await expect(page.locator('.abn-row').filter({ hasText: 'OK-TOW' })).not.toHaveClass(/done/);
  await expect(page.locator('.abn-row').filter({ hasText: 'OK-GLI' })).toHaveClass(/done/);
  await page.locator('.abn-row').filter({ hasText: 'OK-TOW' }).click();
  await page.getByRole('button', { name: /LOG LANDING/ }).click();

  await page.getByRole('button', { name: /LOG/ }).first().click();
  await expect(page.locator('#log-overlay tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: 'EDIT' }).click();
  const deleteTowRow = page.locator('#log-overlay tbody tr').filter({ hasText: 'OK-TOW' });
  const deletedLandingTime = await deleteTowRow.locator('td').nth(6).innerText();
  await deleteTowRow.locator('.log-del-td').click();
  await expect(deleteTowRow).toHaveClass(/delete-selected/);
  await expect(page.getByRole('alertdialog')).toContainText('DELETE FLIGHT?');
  await expect(page.getByRole('alertdialog')).toContainText('OK-TOW');
  await expect(page.getByRole('alertdialog')).toContainText(deletedLandingTime);
  await expect(page.getByRole('checkbox')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'CANCEL' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'CLOSE' }).click();

  await page.getByRole('button', { name: /SELECT TOWPLANE/ }).click();
  await expect(page.locator('.selection-panel')).toBeVisible();
  await page.locator('#airborne-scroll').click({ position: { x: 2, y: 2 } });
  await expect(page.locator('.selection-panel')).toHaveCount(0);
  await expect(page.locator('.bottom-idle')).toBeVisible();

  await page.getByRole('button', { name: /SELECT TOWPLANE/ }).click();
  await expect(page.locator('.selection-panel')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.selection-panel')).toHaveCount(0);
  await expect(page.locator('.bottom-idle')).toBeVisible();

  await page.reload();
  await login();
  await page.getByRole('button', { name: /LOG/ }).first().click();
  await expect(page.locator('#log-overlay tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: /EXPORT/ }).click();
  const exportDialog = page.getByRole('dialog', { name: 'EXPORT' });
  await expect(exportDialog).toBeVisible();
  const dialogBox = await exportDialog.boundingBox();
  const viewport = page.viewportSize();
  expect(dialogBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.abs(dialogBox!.x + dialogBox!.width / 2 - viewport!.width / 2)).toBeLessThan(2);
  expect(Math.abs(dialogBox!.y + dialogBox!.height / 2 - viewport!.height / 2)).toBeLessThan(2);
  await expect(exportDialog.locator('.export-menu-action').first()).toContainText(/KLUBKO/i);
  await expect(exportDialog.locator('.export-menu-action').first()).toHaveClass(/klubko-primary/);
  await expect(exportDialog.locator('.export-menu-icon .action-icon')).toHaveCount(2);
  await expect(exportDialog.locator('.export-menu-icon .action-icon').first()).toHaveCSS('width', '29px');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /EXPORT PDF/ }).click();
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  const pdf = await readFile(downloadedPath!);
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.toString('latin1')).toContain('/Subtype /Image');

  await page.getByRole('button', { name: 'EDIT' }).click();
  await page
    .locator('#log-overlay tbody tr')
    .filter({ hasText: 'OK-TOW' })
    .locator('.log-del-td')
    .click();
  await page.locator('.delete-confirm-submit').click();
  await expect(page.locator('#log-overlay tbody tr')).toHaveCount(1);
  await expect(page.locator('#log-overlay tbody')).toContainText('OK-GLI');
  await expect(page.locator('#log-overlay tbody')).not.toContainText('OK-TOW');
});
