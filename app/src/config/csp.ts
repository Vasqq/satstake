import type { NetworkConfig } from "./networks";

/**
 * The Content-Security-Policy for a build target. Everything is refused unless named: scripts, styles and the
 * icon, fonts and film grain come from the site's own files, and the only hosts the page may connect to are the target's RPC URLs.
 * The build writes this into index.html as a meta tag.
 *
 * @trace LLR-FE-073
 */
export function contentSecurityPolicy(network: NetworkConfig): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    `connect-src ${network.rpcUrls.join(" ")}`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}
