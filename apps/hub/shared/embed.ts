export interface EmbedMessage { channel: 'between-turns'; version: 1; type: 'ready' | 'connected' | 'refresh' | 'error' | 'size'; nonce: string; message?: string; width?: number; height?: number; }
export function acceptsEmbedMessage(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>, expectedOrigin: string, expectedSource: MessageEventSource | null, nonce: string): event is MessageEvent<EmbedMessage> {
  const data = event.data;
  return !!expectedSource && event.source === expectedSource && event.origin === expectedOrigin && !!data && typeof data === 'object' && data.channel === 'between-turns' && data.version === 1 && data.nonce === nonce && ['ready', 'connected', 'refresh', 'error', 'size'].includes(data.type)
    && (data.type !== 'size' || [data.width, data.height].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 16384));
}
