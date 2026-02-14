/**
 * OSV.dev (Open Source Vulnerabilities) type definitions
 * Used for dependency vulnerability scanning across multiple ecosystems
 */

export interface OsvVulnerability {
  id: string; // CVE-2024-1234 or GHSA-xxxx
  packageName: string;
  version: string;
  ecosystem: string; // npm, PyPI, Go, etc.
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  summary: string;
  details: string;
  aliases: string[];
  references: Array<{ type: string; url: string }>;
  cvssScore?: number;
  fixedVersions: string[];
  manifestFile: string;
}

export interface OsvScanResult {
  success: boolean;
  vulnerabilities: OsvVulnerability[];
  stats: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  scannedFiles: number;
  scannedPackages: number;
  scanDuration: number;
  error?: string;
}

/**
 * OSV.dev API request/response types
 * https://google.github.io/osv.dev/api/
 */

export interface OsvPackageQuery {
  package: {
    ecosystem: string;
    name: string;
  };
  version?: string;
}

export interface OsvBatchRequest {
  queries: OsvPackageQuery[];
}

export interface OsvAffectedRange {
  type: string;
  events: Array<{
    introduced?: string;
    fixed?: string;
    last_affected?: string;
    limit?: string;
  }>;
}

export interface OsvAffected {
  package?: {
    ecosystem: string;
    name: string;
  };
  ranges?: OsvAffectedRange[];
  versions?: string[];
  database_specific?: {
    severity?: string;
    cvss_score?: number;
  };
}

export interface OsvSeverity {
  type: string;
  score: string;
}

export interface OsvReference {
  type: string;
  url: string;
}

export interface OsvApiVulnerability {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  affected?: OsvAffected[];
  references?: OsvReference[];
  severity?: OsvSeverity[];
  database_specific?: {
    severity?: string;
    cvss_score?: number;
  };
}

export interface OsvBatchResponse {
  results: Array<{
    vulns?: OsvApiVulnerability[];
  }>;
}

/**
 * Package information extracted from manifest files
 */
export interface PackageInfo {
  name: string;
  version: string;
  ecosystem: string;
  manifestFile: string;
}

/**
 * Ecosystem identifiers used by OSV.dev
 */
export type OsvEcosystem = 'npm' | 'PyPI' | 'Go' | 'crates.io' | 'Maven' | 'NuGet' | 'Packagist' | 'RubyGems' | 'Hex';

/**
 * Manifest file patterns for different ecosystems
 */
export const MANIFEST_PATTERNS: Record<string, RegExp> = {
  npm: /package\.json$/i,
  python: /requirements\.txt$|Pipfile$|pyproject\.toml$/i,
  go: /go\.mod$/i,
  rust: /Cargo\.toml$/i,
  maven: /pom\.xml$/i,
  gradle: /build\.gradle$|build\.gradle\.kts$/i,
  nuget: /packages\.config$|\.csproj$/i,
  composer: /composer\.json$/i,
  ruby: /Gemfile$/i,
};
