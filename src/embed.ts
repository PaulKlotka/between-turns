import { acceptsEmbedMessage } from '../shared/embed';
import type { Grant } from '../shared/types';
import { command } from './client';
/** Mount once per game instance. Parent navigation only hides this element. */
export function mountEmbed(host: HTMLElement, options: { url: string; appId: string; sessionId: string; runId?: string; title: string; refresh: () => void; report: (message: string) => void }): () => void {
  const url = new URL(options.url); const nonce = crypto.randomUUID();
  url.searchParams.set('btVersion', '1'); url.searchParams.set('btNonce', nonce); url.searchParams.set('btParentOrigin', location.origin);
  const frame = document.createElement('iframe'); frame.title = options.title; frame.src = url.href;
  frame.referrerPolicy = 'no-referrer'; frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
  frame.className = 'game-frame'; host.replaceChildren(frame);
  // Games occupy a bounded stage; reward inventories retain their normal scrolling layout.
  const fitted = !!options.runId;
  host.classList.toggle('fitted-embed', fitted);
  let contentSize: { width: number; height: number } | undefined;
  let lastViewport = '';
  const fit = () => {
    if (!fitted || !host.clientWidth || !host.clientHeight) return;
    if (contentSize) {
      const scale = Math.min(1, host.clientWidth / contentSize.width, host.clientHeight / contentSize.height);
      frame.style.width = `${contentSize.width}px`; frame.style.height = `${contentSize.height}px`;
      frame.style.transform = `scale(${scale})`;
      frame.style.left = `${Math.max(0, (host.clientWidth - contentSize.width * scale) / 2)}px`;
    }
    const viewport = `${host.clientWidth}:${host.clientHeight}`;
    if (viewport !== lastViewport) {
      lastViewport = viewport;
      frame.contentWindow?.postMessage({ channel: 'between-turns', version: 1, type: 'viewport', nonce, width: host.clientWidth, height: host.clientHeight }, url.origin);
    }
  };
  const observer = new ResizeObserver(fit);
  if (fitted) observer.observe(host);
  const onLoad = () => { lastViewport = ''; fit(); };
  frame.addEventListener('load', onLoad);
  let disposed = false; let connecting = false; let connected = false;
  const timeout = window.setTimeout(() => { if (!connected) options.report(`${options.title} is taking longer than expected to connect. Try refreshing the page.`); }, 20_000);
  const onMessage = async (event: MessageEvent) => {
    if (!acceptsEmbedMessage(event, url.origin, frame.contentWindow, nonce) || disposed) return;
    if (event.data.type === 'ready' && !connecting) {
      connecting = true;
      try {
        const grant = await command(options.sessionId ? { action: 'connect', appId: options.appId, sessionId: options.sessionId, ...(options.runId ? { runId: options.runId } : {}), nonce } : { action: 'accountConnect', appId: options.appId, nonce }) as Grant;
        if (!disposed) frame.contentWindow?.postMessage({ channel: 'between-turns', version: 1, type: 'connect', nonce, grant: grant.token, expiresAt: grant.expiresAt }, url.origin);
      } catch { options.report('The game connection could not be established. Please refresh to try again.'); }
      finally { connecting = false; }
    } else if (event.data.type === 'connected') { connected = true; window.clearTimeout(timeout); lastViewport = ''; fit(); }
    else if (event.data.type === 'size' && fitted) { contentSize = { width: event.data.width!, height: event.data.height! }; fit(); }
    else if (event.data.type === 'refresh') options.refresh();
    else if (event.data.type === 'error') options.report('The embedded application reported a connection problem.');
  };
  window.addEventListener('message', onMessage);
  return () => { disposed = true; observer.disconnect(); frame.removeEventListener('load', onLoad); window.clearTimeout(timeout); window.removeEventListener('message', onMessage); frame.remove(); host.classList.remove('fitted-embed'); };
}
