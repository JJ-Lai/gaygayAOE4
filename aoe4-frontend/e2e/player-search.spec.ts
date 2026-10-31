import { expect, test } from '@playwright/test'
import { SAMPLE_PROFILE_ID, mockPlayerApis } from './helpers/mockApi'

test('search navigates to player overview dashboard', async ({ page }) => {
  await mockPlayerApis(page)
  await page.goto('/')

  await page.getByPlaceholder('輸入 Profile ID 或玩家名稱').last().fill(String(SAMPLE_PROFILE_ID))
  await page.getByRole('button', { name: '搜尋' }).last().click()

  await expect(page).toHaveURL(new RegExp(`/player/${SAMPLE_PROFILE_ID}$`))
  await expect(page.getByText('總場次')).toBeVisible()
  await expect(page.getByText('勝率')).toBeVisible()
  await expect(page.getByText('最常用文明')).toBeVisible()
})

test('invalid profile id shows error', async ({ page }) => {
  await mockPlayerApis(page)
  await page.goto('/')

  await page.getByPlaceholder('輸入 Profile ID 或玩家名稱').last().fill('abc')
  await page.getByRole('button', { name: '搜尋' }).last().click()

  await expect(page.getByText(/有效的 Profile ID/)).toBeVisible()
})
