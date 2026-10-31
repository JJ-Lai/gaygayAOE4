import { expect, test } from '@playwright/test'

async function mockOpsApis(page: import('@playwright/test').Page) {
  await page.route('**/api/v1/ops/sync-overview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totalPlayers: 5,
        totalGames: 120,
        gamesWithoutSummary: 30,
        summaryStatusCounts: [
          { status: 'SUCCESS', count: 80 },
          { status: 'FAILED', count: 5 },
        ],
        alerts: [
          {
            severity: 'WARNING',
            code: 'MANY_GAMES_WITHOUT_SUMMARY',
            message: '尚有大量對戰尚未嘗試抓取 Summary',
            count: 30,
          },
        ],
        checkedAt: new Date().toISOString(),
      }),
    })
  })

  await page.route('**/api/v1/ops/failed-summaries**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        failures: [
          {
            gameId: 999001,
            profileId: 10861747,
            fetchStatus: 'FAILED',
            retryCount: 2,
            errorMessage: 'timeout',
            fetchedAt: new Date().toISOString(),
          },
        ],
      }),
    })
  })

  await page.route('**/api/v1/ops/players/sync-status**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ players: [] }),
    })
  })
}

test('ops page shows sync overview and alerts', async ({ page }) => {
  await mockOpsApis(page)
  await page.goto('/ops')

  await expect(page.getByRole('heading', { name: '同步狀態 Dashboard' })).toBeVisible()
  await expect(page.getByText('已入庫玩家')).toBeVisible()
  await expect(page.getByText('5', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('尚有大量對戰尚未嘗試抓取 Summary')).toBeVisible()
  await expect(page.getByText('近期 Summary 失敗')).toBeVisible()
  await expect(page.getByText('999001')).toBeVisible()
  await expect(page.getByText('SQL 查詢計畫檢視')).toBeVisible()
  await expect(page.getByText('重新解析 Summary', { exact: true })).toBeVisible()
})

test('ops page loads query plans on demand', async ({ page }) => {
  await mockOpsApis(page)
  await page.route('**/api/v1/ops/query-plans**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        profileId: 10861747,
        databaseProduct: 'H2',
        plans: [
          {
            queryKey: 'civ-stats',
            description: '各文明勝率聚合',
            executionMs: 3,
            planLines: ['INDEX SCAN ON fact_game_player'],
          },
        ],
        checkedAt: new Date().toISOString(),
      }),
    })
  })

  await page.goto('/ops')
  const planInput = page.getByRole('spinbutton', { name: 'Profile ID', exact: true })
  await planInput.fill('10861747')
  await planInput.blur()
  const responsePromise = page.waitForResponse('**/api/v1/ops/query-plans**')
  await page.getByRole('button', { name: '檢視執行計畫' }).click()
  await responsePromise

  await expect(page.getByRole('cell', { name: 'civ-stats' })).toBeVisible()
  await expect(page.getByText('資料庫：H2')).toBeVisible()
})
