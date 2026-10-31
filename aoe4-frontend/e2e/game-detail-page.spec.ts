import { expect, test } from '@playwright/test'

const PROFILE_ID = 1224481
const GAME_ID = 131766848

async function mockGameDetailApis(page: import('@playwright/test').Page) {
  await page.route(`**/api/v1/games/${GAME_ID}**`, async (route) => {
    const url = route.request().url()
    if (url.includes('/timeline')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          gameId: GAME_ID,
          profileId: PROFILE_ID,
          resources: [
            {
              resource: 'food',
              points: [
                { minute: 0, secondMark: 0, accumulatedValue: 100, perMinuteValue: null },
                { minute: 5, secondMark: 300, accumulatedValue: 500, perMinuteValue: 80 },
              ],
            },
          ],
          armyValues: [{ minute: 0, secondMark: 0, armyValue: 200 }],
          buildEvents: [
            {
              eventSecond: 120,
              minute: 2,
              entityType: 'unit',
              pbgid: 1001,
              displayName: 'Spearman',
              eventKind: 'FINISHED',
            },
            {
              eventSecond: 600,
              minute: 10,
              entityType: 'unit',
              pbgid: 1002,
              displayName: 'Archer',
              eventKind: 'DESTROYED',
            },
          ],
          opponent: {
            profileId: 888888,
            playerName: 'Rival',
            civilization: 'French',
            resources: [
              {
                resource: 'food',
                points: [{ minute: 0, secondMark: 0, accumulatedValue: 80, perMinuteValue: null }],
              },
            ],
            armyValues: [{ minute: 0, secondMark: 0, armyValue: 150 }],
            buildEvents: [
              {
                eventSecond: 180,
                minute: 3,
                entityType: 'unit',
                pbgid: 2001,
                displayName: 'Knight',
                eventKind: 'CONSTRUCTED',
              },
            ],
          },
          availableOpponents: [
            { profileId: 888888, playerName: 'Rival', civilization: 'French', hasTimelineData: true, relationship: 'opponent' },
            { profileId: 777777, playerName: 'Ally', civilization: 'English', hasTimelineData: false, relationship: 'teammate' },
          ],
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        game: {
          gameId: GAME_ID,
          startedAt: '2026-01-01T12:00:00Z',
          updatedAt: null,
          durationSeconds: 1800,
          mapName: 'Dry Arabia',
          leaderboardCode: 'rm_1v1',
          kind: null,
          patchNumber: 15,
          server: null,
          players: [],
        },
        hasSummary: true,
        summaryFetchStatus: 'SUCCESS',
        summaryFetchedAt: new Date().toISOString(),
        resourceDataPoints: 2,
        buildEventCount: 2,
        combatStats: {
          buildingsLost: 1,
          unitsLost: 12,
          unitKills: 8,
          squadKills: 3,
          enemyDeaths: 5,
        },
      }),
    })
  })
}

test('game detail shows combat stats and timeline', async ({ page }) => {
  await mockGameDetailApis(page)
  await page.goto(`/player/${PROFILE_ID}/games/${GAME_ID}`)

  const main = page.getByRole('main')
  await expect(main.getByText(`對戰 #${GAME_ID}`)).toBeVisible()
  await expect(main.getByText('戰鬥統計')).toBeVisible()
  await expect(main.getByText('單位損失')).toBeVisible()
  await expect(main.getByText('12', { exact: true })).toBeVisible()
  await expect(main.getByText('資源曲線（雙方對比）')).toBeVisible()
  await expect(main.getByText('軍隊價值（雙方對比）')).toBeVisible()
  await expect(main.getByText('Rival (French)').first()).toBeVisible()
  await expect(main.getByText('Spearman')).toBeVisible()
})

test('game detail filters destroyed build events', async ({ page }) => {
  await mockGameDetailApis(page)
  await page.goto(`/player/${PROFILE_ID}/games/${GAME_ID}`)

  await expect(page.getByText('Spearman')).toBeVisible()
  await page.getByText('僅損失').click()
  await expect(page.getByText('Spearman')).not.toBeVisible()
  await expect(page.getByText('Archer')).toBeVisible()
})

test('game detail shows opponent build events side by side', async ({ page }) => {
  await mockGameDetailApis(page)
  await page.goto(`/player/${PROFILE_ID}/games/${GAME_ID}`)

  const main = page.getByRole('main')
  await expect(main.getByText('建造事件（雙方對比，前 30 項）')).toBeVisible()
  await expect(main.getByRole('heading', { name: '我方' })).toBeVisible()
  await expect(main.getByRole('heading', { name: 'Rival' })).toBeVisible()
  await expect(main.getByText('Knight')).toBeVisible()
})

test('game detail shows opponent selector for multi-player games', async ({ page }) => {
  await mockGameDetailApis(page)
  await page.goto(`/player/${PROFILE_ID}/games/${GAME_ID}`)

  const main = page.getByRole('main')
  await expect(main.getByText('切換對比玩家')).toBeVisible()
  await main.getByRole('row', { name: /切換對比玩家/ }).getByRole('combobox').click()
  await expect(page.locator('.ant-select-item-group[title="敵方"]')).toBeVisible()
  await expect(page.locator('.ant-select-item-group[title="隊友"]')).toBeVisible()
  await expect(page.getByText('Ally (English) — 無 Summary')).toBeVisible()
})

test('game detail copy share link button is visible', async ({ page }) => {
  await mockGameDetailApis(page)
  await page.goto(`/player/${PROFILE_ID}/games/${GAME_ID}`)

  await expect(page.getByRole('button', { name: '複製分享連結' })).toBeVisible()
  await expect(page.getByRole('button', { name: '匯出 PNG' }).first()).toBeVisible()
})
