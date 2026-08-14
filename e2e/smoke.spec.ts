import { test, expect } from '@playwright/test'

test('la app carga sin errores', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/./)
})
