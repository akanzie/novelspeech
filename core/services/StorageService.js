export const StorageService = {
  async saveState(state) {
    await chrome.storage.local.set({ readingState: state });
  },
  async getState() {
    const result = await chrome.storage.local.get("readingState");
    return result.readingState || null;
  }
};
