import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs'

const projectToken = process.env.POSTHOG_PROJECT_TOKEN?.trim()
const host = process.env.POSTHOG_HOST?.trim()

const logProvider =
  projectToken && host
    ? new LoggerProvider({
        resource: resourceFromAttributes({ 'service.name': 'shion-gateway' }),
        processors: [
          new BatchLogRecordProcessor(
            new OTLPLogExporter({
              url: `${host.replace(/\/$/, '')}/i/v1/logs`,
              headers: { Authorization: `Bearer ${projectToken}` },
            }),
            { exportTimeoutMillis: 3000 },
          ),
        ],
      })
    : undefined

// This provider is intentionally separate from the app's console logging.
// Only lifecycle lines emitted through this logger are exported to PostHog.
export const posthogLogger = logProvider?.getLogger('shion.posthog')

export async function shutdownPostHogLogs(): Promise<void> {
  if (!logProvider) {
    return
  }

  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    await Promise.race([
      logProvider.shutdown(),
      new Promise<void>(resolve => {
        timeout = setTimeout(resolve, 3000)
      }),
    ])
  } catch {
    // Log export must never prevent a clean gateway shutdown.
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}
