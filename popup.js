function refreshCount() {
  chrome.storage.local.get({ log: [] }, ({ log }) => {
    document.getElementById('count').textContent = `log: ${log.length} entries`;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  refreshCount();

  document.getElementById('export').addEventListener('click', () => {
    chrome.storage.local.get({ log: [] }, ({ log }) => {
      const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const stamp = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const name = `x-heartprint/log_${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}_${pad(stamp.getHours())}-${pad(stamp.getMinutes())}-${pad(stamp.getSeconds())}.json`;
      chrome.downloads.download({ url, filename: name, saveAs: true }, () => {
        URL.revokeObjectURL(url);
      });
    });
  });

  document.getElementById('clear').addEventListener('click', () => {
    if (!confirm('clear the log? this cannot be undone.')) return;
    chrome.storage.local.set({ log: [] }, refreshCount);
  });
});
