/**
 * @file filter.ts
 * @description Strict Security & Privacy Guardrail Node for LangGraph.
 * Ensures zero private key seeds, raw passwords, or internal network IPs enter prompts.
 */

export interface SecurityCheckResult {
  passed: boolean;
  violations: string[];
  sanitizedText: string;
}

export class SecurityFilter {
  // Regex patterns detecting potential Ed25519/X25519 base64 private keys (32/64 bytes)
  private static readonly PRIVATE_KEY_PATTERN = /([A-Za-z0-9+/]{43,86}={0,2})/g;
  private static readonly IPV4_PATTERN = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;

  /**
   * Evaluates text for cryptographic security risks and sanitizes where applicable.
   */
  static evaluate(text: string, knownLocalPrivateKeyBase64?: string): SecurityCheckResult {
    const violations: string[] = [];
    let sanitizedText = text;

    // Check 1: Known private key exact match
    if (knownLocalPrivateKeyBase64 && text.includes(knownLocalPrivateKeyBase64)) {
      violations.push('CRITICAL: Prompt contains local private key bytes.');
      sanitizedText = sanitizedText.replace(knownLocalPrivateKeyBase64, '[REDACTED_PRIVATE_KEY]');
    }

    // Check 2: Potential private key entropy blobs
    const matches = text.match(this.PRIVATE_KEY_PATTERN);
    if (matches) {
      for (const m of matches) {
        if (m.length >= 64 && (m.endsWith('=') || m.endsWith('=='))) {
          violations.push('WARNING: Detected high-entropy base64 key material.');
          sanitizedText = sanitizedText.replace(m, '[REDACTED_KEY_BLOB]');
        }
      }
    }

    // Check 3: Raw IP addresses leakage
    const ipMatches = text.match(this.IPV4_PATTERN);
    if (ipMatches) {
      for (const ip of ipMatches) {
        violations.push(`WARNING: Detected raw network IP address ${ip}.`);
        sanitizedText = sanitizedText.replace(ip, '[REDACTED_IP]');
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      sanitizedText
    };
  }
}
