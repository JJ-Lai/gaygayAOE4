import type { Page } from '@playwright/test'

const SAMPLE_PROFILE_ID = 10861747

export async function mockPlayerApis(page: Page) {
  await page.route('**/api/v1/players/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ totalCount: 0, players: [] }),
    })
  })

  await page.route(`**/api/v1/players/${SAMPLE_PROFILE_ID}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        profileId: SAMPLE_PROFILE_ID,
        name: '測試玩家',
        country: 'tw',
        steamId: '76561198000000000',
      }),
    })
  })

  await page.route(`**/api/v1/players/${SAMPLE_PROFILE_ID}/sync-status`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        profileId: SAMPLE_PROFILE_ID,
        totalGames: 10,
        summariesSynced: 3,
        summariesPending: 0,
        summariesFailed: 0,
        checkedAt: new Date().toISOString(),
      }),
    })
  })

  await page.route('**/api/v1/meta/filters', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        civilizations: [{ code: 'english', displayName: 'English' }],
        leaderboards: [{ code: 'rm_1v1', displayName: 'Ranked 1v1' }],
        maps: [],
        patches: [],
        resourceTypes: [],
      }),
    })
  })

  await page.route('**/api/v1/analytics/overview**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        profileId: SAMPLE_PROFILE_ID,
        totalGames: 10,
        wins: 6,
        losses: 4,
        winRate: 0.6,
        mostPlayedCiv: 'english',
        gamesWithSummary: 3,
        recentTrend: [],
      }),
    })
  })
}

export { SAMPLE_PROFILE_ID }
