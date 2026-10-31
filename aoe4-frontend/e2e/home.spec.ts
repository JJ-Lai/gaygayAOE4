import { expect, test } from '@playwright/test'

test('home page shows search and profile id guide', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '世紀帝國 IV 對戰分析' })).toBeVisible()
  const searchInput = page.getByPlaceholder('輸入 Profile ID 或玩家名稱').last()
  await expect(searchInput).toBeVisible()
  await expect(page.getByRole('button', { name: '搜尋' }).last()).toBeVisible()
  await expect(page.getByText('AoE4 World 玩家頁面')).toBeVisible()
})
