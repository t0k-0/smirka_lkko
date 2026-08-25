import { expect, test } from '@playwright/test';

test('renders the authentication gate without missing icon requests', async ({ page }) => {
  const missing: string[] = [];
  page.on('response', (response) => {
    if (response.status() === 404) missing.push(response.url());
  });
  await page.goto('/');
  await expect(page.locator('#login-overlay')).toBeVisible();
  await expect(page.getByRole('button', { name: 'LOGIN' })).toBeVisible();
  await expect(page.locator('.login-logo-img')).toHaveAttribute(
    'src',
    /icon_darkmode\.svg/
  );
  expect(missing).toEqual([]);
});

test('logs an aerotow through landing and restores the daily log', async ({ page }) => {
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
          { first_name: 'Glider', last_name: 'Pilot' }
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
  await page.getByRole('button', { name: /Glider Pilot/ }).click();
  await page.getByRole('button', { name: /SOLO - NO SECOND PILOT/ }).click();
  await page.getByRole('button', { name: /LOG TAKEOFF/ }).click();

  await expect(page.locator('#airborne-scroll')).toContainText('OK-TOW');
  await expect(page.locator('#airborne-scroll')).toContainText('OK-GLI');

  await page.locator('.abn-row').filter({ hasText: 'OK-TOW' }).click();
  await page.getByRole('button', { name: /LOG LANDING/ }).click();
  await page.locator('.abn-row').filter({ hasText: 'OK-GLI' }).click();
  await page.getByRole('button', { name: /LOG LANDING/ }).click();
  await expect(page.locator('#airborne-scroll')).toContainText('NO FLIGHTS AIRBORNE');

  await page.getByRole('button', { name: /LOG/ }).first().click();
  await expect(page.locator('#log-overlay tbody')).toContainText('OK-TOW');
  await expect(page.locator('#log-overlay tbody')).toContainText('OK-GLI');
  await page.getByRole('button', { name: 'CLOSE' }).click();

  await page.reload();
  await login();
  await page.getByRole('button', { name: /LOG/ }).first().click();
  await expect(page.locator('#log-overlay tbody tr')).toHaveCount(2);
});
