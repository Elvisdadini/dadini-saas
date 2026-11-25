import { expect, test } from '@playwright/test';

const USUARIO = process.env.E2E_USUARIO || 'admin';
const PASSWORD = process.env.E2E_PASSWORD || 'Dadini2026!';

test('la pantalla de acceso muestra el formulario', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible();
  await expect(page.getByPlaceholder('Ej. admin')).toBeVisible();
  await expect(page.getByRole('button', { name: /Ingresar al panel/ })).toBeVisible();
});

test('login correcto abre el panel y deja sesión iniciada', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Ej. admin').fill(USUARIO);
  await page.getByPlaceholder('••••••••').fill(PASSWORD);
  await page.getByRole('button', { name: /Ingresar al panel/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Panel general')).toBeVisible();
  const token = await page.evaluate(() => localStorage.getItem('dadini_token'));
  expect(token).toBeTruthy();
});

test('credenciales inválidas muestran aviso y no guardan token', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Ej. admin').fill(USUARIO);
  await page.getByPlaceholder('••••••••').fill('clave-incorrecta');
  await page.getByRole('button', { name: /Ingresar al panel/ }).click();
  await expect(page.getByText(/Usuario o contraseña incorrectos/)).toBeVisible();
  const token = await page.evaluate(() => localStorage.getItem('dadini_token'));
  expect(token).toBeFalsy();
});
