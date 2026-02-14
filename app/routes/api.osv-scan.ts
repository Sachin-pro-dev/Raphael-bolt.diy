import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import type { OsvScanResult, OsvVulnerability, PackageInfo } from '~/types/osv';
import { extractAllPackages, detectManifestType } from '~/lib/security/manifest-parsers';
import { scanPackages } from '~/lib/security/osv-client';

interface ScanRequestBody {
  files?: Array<{ path: string; content: string }>;
}

/**
 * Calculate statistics from vulnerabilities
 */
function calculateStats(vulnerabilities: OsvVulnerability[]) {
  return {
    total: vulnerabilities.length,
    critical: vulnerabilities.filter((v) => v.severity === 'CRITICAL').length,
    high: vulnerabilities.filter((v) => v.severity === 'HIGH').length,
    medium: vulnerabilities.filter((v) => v.severity === 'MEDIUM').length,
    low: vulnerabilities.filter((v) => v.severity === 'LOW').length,
  };
}

/**
 * OSV dependency vulnerability scan endpoint
 */
export async function action({ request }: ActionFunctionArgs) {
  const startTime = Date.now();

  try {
    console.log('[OSV] Starting dependency vulnerability scan...');

    const body = (await request.json()) as ScanRequestBody;
    const { files } = body;

    console.log('[OSV] Request received:', {
      filesCount: files?.length || 0,
    });

    if (!files || !Array.isArray(files) || files.length === 0) {
      console.error('[OSV] No files provided');
      return json<OsvScanResult>(
        {
          success: false,
          vulnerabilities: [],
          stats: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
          scannedFiles: 0,
          scannedPackages: 0,
          scanDuration: 0,
          error: 'No files provided for scanning',
        },
        { status: 400 },
      );
    }

    // Filter for manifest files only
    const manifestFiles = files.filter((file) => {
      const manifestType = detectManifestType(file.path);
      return manifestType !== null;
    });

    console.log('[OSV] Manifest files found:', manifestFiles.length);

    if (manifestFiles.length === 0) {
      console.log('[OSV] No dependency manifest files found');
      return json<OsvScanResult>(
        {
          success: false,
          vulnerabilities: [],
          stats: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
          scannedFiles: 0,
          scannedPackages: 0,
          scanDuration: 0,
          error:
            'No dependency manifest files found. Please add package.json, requirements.txt, go.mod, Cargo.toml, or other dependency files.',
        },
        { status: 400 },
      );
    }

    // Log manifest files for debugging
    console.log(
      '[OSV] Scanning manifests:',
      manifestFiles.map((f) => f.path),
    );

    // Extract packages from all manifest files
    const packages: PackageInfo[] = extractAllPackages(manifestFiles);

    console.log('[OSV] Extracted packages:', packages.length);

    if (packages.length === 0) {
      console.log('[OSV] No packages extracted from manifest files');
      return json<OsvScanResult>({
        success: true,
        vulnerabilities: [],
        stats: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        scannedFiles: manifestFiles.length,
        scannedPackages: 0,
        scanDuration: Date.now() - startTime,
      });
    }

    // Log package breakdown by ecosystem
    const ecosystemCounts = packages.reduce(
      (acc, pkg) => {
        acc[pkg.ecosystem] = (acc[pkg.ecosystem] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    console.log('[OSV] Packages by ecosystem:', ecosystemCounts);

    // Warn if too many packages
    if (packages.length > 500) {
      console.warn(`[OSV] Large number of packages (${packages.length}), scan may take longer`);
    }

    // Query OSV API for vulnerabilities
    console.log('[OSV] Querying OSV.dev API...');

    const vulnerabilities = await scanPackages(packages);

    // Calculate statistics
    const stats = calculateStats(vulnerabilities);
    const scanDuration = Date.now() - startTime;

    console.log('[OSV] Scan complete:', {
      scannedFiles: manifestFiles.length,
      scannedPackages: packages.length,
      totalVulnerabilities: stats.total,
      critical: stats.critical,
      high: stats.high,
      medium: stats.medium,
      low: stats.low,
      scanDuration: `${(scanDuration / 1000).toFixed(2)}s`,
    });

    return json<OsvScanResult>({
      success: true,
      vulnerabilities,
      stats,
      scannedFiles: manifestFiles.length,
      scannedPackages: packages.length,
      scanDuration,
    });
  } catch (error: any) {
    console.error('[OSV] Unexpected error:', error);

    return json<OsvScanResult>(
      {
        success: false,
        vulnerabilities: [],
        stats: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        scannedFiles: 0,
        scannedPackages: 0,
        scanDuration: Date.now() - startTime,
        error: error.message || 'Unknown error occurred during vulnerability scan',
      },
      { status: 500 },
    );
  }
}

/**
 * Health check endpoint
 */
export async function loader() {
  // OSV.dev API is always available (no installation required)
  return json({
    available: true,
    message: 'OSV.dev API is available',
  });
}
