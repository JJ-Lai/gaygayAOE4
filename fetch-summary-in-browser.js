// 在 Chrome 已能開啟 summary JSON 的頁面上，貼到 Console 執行：
// https://aoe4world.com/players/10861747/games/242171403/summary?api_key=你的key&camelize=true

(async () => {
  const response = await fetch(location.href, { credentials: 'include' });
  if (!response.ok) {
    console.error('HTTP', response.status, await response.text());
    return;
  }
  const data = await response.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'aoe4-summary-242171403.json';
  link.click();
  URL.revokeObjectURL(link.href);
  console.log('已下載 aoe4-summary-242171403.json');
})();
