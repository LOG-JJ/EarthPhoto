const MAX_RETRY = 10;
const RETRY_DELAY_MS = 300;

async function boot(attempt = 0): Promise<void> {
  try {
    await import('./main');
  } catch (error) {
    if (attempt >= MAX_RETRY) {
      console.error('Failed to bootstrap renderer', error);
      return;
    }
    setTimeout(() => {
      void boot(attempt + 1);
    }, RETRY_DELAY_MS);
  }
}

void boot();
