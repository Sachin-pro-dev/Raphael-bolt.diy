/**
 * OSV.dev API client for vulnerability scanning
 * https://google.github.io/osv.dev/api/
 */

import type {
  OsvBatchRequest,
  OsvBatchResponse,
  OsvApiVulnerability,
  OsvVulnerability,
  PackageInfo,
  OsvAffectedRange,
} from '~/types/osv';

const OSV_API_URL = 'https://api.osv.dev/v1/querybatch';
const MAX_BATCH_SIZE = 1000; // OSV API limit

/**
 * Map OSV severity to our standardized levels
 */
export function mapOsvSeverity(vuln: OsvApiVulnerability): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN' {
  // Check for CVSS score first (most reliable)
  const cvssScore = getCvssScore(vuln);

  if (cvssScore !== undefined) {
    if (cvssScore >= 9.0) {
      return 'CRITICAL';
    }

    if (cvssScore >= 7.0) {
      return 'HIGH';
    }

    if (cvssScore >= 4.0) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  // Fallback to severity field
  if (vuln.severity && vuln.severity.length > 0) {
    const severityStr = vuln.severity[0].type.toUpperCase();

    if (severityStr.includes('CRITICAL')) {
      return 'CRITICAL';
    }

    if (severityStr.includes('HIGH')) {
      return 'HIGH';
    }

    if (severityStr.includes('MEDIUM') || severityStr.includes('MODERATE')) {
      return 'MEDIUM';
    }

    if (severityStr.includes('LOW')) {
      return 'LOW';
    }
  }

  // Check database_specific severity
  if (vuln.database_specific?.severity) {
    const dbSeverity = vuln.database_specific.severity.toUpperCase();

    if (dbSeverity.includes('CRITICAL')) {
      return 'CRITICAL';
    }

    if (dbSeverity.includes('HIGH')) {
      return 'HIGH';
    }

    if (dbSeverity.includes('MEDIUM') || dbSeverity.includes('MODERATE')) {
      return 'MEDIUM';
    }

    if (dbSeverity.includes('LOW')) {
      return 'LOW';
    }
  }

  // Default to MEDIUM for unknown severity
  return 'MEDIUM';
}

/**
 * Extract CVSS score from vulnerability
 */
export function getCvssScore(vuln: OsvApiVulnerability): number | undefined {
  // Check database_specific first
  if (vuln.database_specific?.cvss_score) {
    return vuln.database_specific.cvss_score;
  }

  // Check severity array for CVSS score
  if (vuln.severity && vuln.severity.length > 0) {
    for (const sev of vuln.severity) {
      if (sev.type.includes('CVSS')) {
        const score = parseFloat(sev.score);

        if (!isNaN(score)) {
          return score;
        }
      }
    }
  }

  return undefined;
}

/**
 * Extract fixed versions from vulnerability ranges
 */
export function extractFixedVersions(ranges: OsvAffectedRange[] | undefined): string[] {
  const fixedVersions: string[] = [];

  if (!ranges) {
    return fixedVersions;
  }

  for (const range of ranges) {
    if (range.events) {
      for (const event of range.events) {
        if (event.fixed) {
          fixedVersions.push(event.fixed);
        }
      }
    }
  }

  return fixedVersions;
}

/**
 * Fetch full vulnerability details by ID
 */
async function fetchVulnerabilityDetails(id: string): Promise<OsvApiVulnerability | null> {
  try {
    const response = await fetch(`https://api.osv.dev/v1/vulns/${id}`);

    if (!response.ok) {
      console.error(`[OSV] Failed to fetch details for ${id}: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`[OSV] Error fetching details for ${id}:`, error);
    return null;
  }
}

/**
 * Query OSV API in batches
 */
export async function queryOsvBatch(packages: PackageInfo[]): Promise<Map<string, OsvApiVulnerability[]>> {
  const vulnerabilityMap = new Map<string, OsvApiVulnerability[]>();

  // Split into batches of MAX_BATCH_SIZE
  const batches: PackageInfo[][] = [];

  for (let i = 0; i < packages.length; i += MAX_BATCH_SIZE) {
    batches.push(packages.slice(i, i + MAX_BATCH_SIZE));
  }

  console.log(`[OSV] Querying ${packages.length} packages in ${batches.length} batch(es)`);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];

    console.log(`[OSV] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} packages)`);

    try {
      const request: OsvBatchRequest = {
        queries: batch.map((pkg) => ({
          package: {
            ecosystem: pkg.ecosystem,
            name: pkg.name,
          },
          version: pkg.version,
        })),
      };

      const response = await fetch(OSV_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        console.error(`[OSV] API request failed with status ${response.status}`);

        // On rate limit, wait and retry once
        if (response.status === 429) {
          console.log('[OSV] Rate limited, waiting 2 seconds before retry...');
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Retry once
          const retryResponse = await fetch(OSV_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
          });

          if (!retryResponse.ok) {
            throw new Error(`OSV API failed after retry: ${retryResponse.status}`);
          }

          const retryData: OsvBatchResponse = await retryResponse.json();

          // Process retry results and fetch full details
          for (let index = 0; index < batch.length; index++) {
            const pkg = batch[index];
            const result = retryData.results[index];

            if (result?.vulns && result.vulns.length > 0) {
              console.log(`[OSV] Found ${result.vulns.length} vulnerabilities for ${pkg.name}, fetching details...`);

              // Fetch full details for each vulnerability
              const fullVulns = await Promise.all(
                result.vulns.map(async (vuln) => {
                  const fullDetails = await fetchVulnerabilityDetails(vuln.id);
                  return fullDetails || vuln; // Fallback to minimal data if fetch fails
                }),
              );

              const key = `${pkg.ecosystem}:${pkg.name}@${pkg.version}`;
              vulnerabilityMap.set(key, fullVulns);
            }
          }

          continue;
        }

        throw new Error(`OSV API request failed: ${response.status}`);
      }

      const data: OsvBatchResponse = await response.json();

      // Map results back to packages and fetch full details
      for (let index = 0; index < batch.length; index++) {
        const pkg = batch[index];
        const result = data.results[index];

        if (result?.vulns && result.vulns.length > 0) {
          console.log(`[OSV] Found ${result.vulns.length} vulnerabilities for ${pkg.name}, fetching details...`);

          // Fetch full details for each vulnerability
          const fullVulns = await Promise.all(
            result.vulns.map(async (vuln) => {
              const fullDetails = await fetchVulnerabilityDetails(vuln.id);
              return fullDetails || vuln; // Fallback to minimal data if fetch fails
            }),
          );

          const key = `${pkg.ecosystem}:${pkg.name}@${pkg.version}`;
          vulnerabilityMap.set(key, fullVulns);

          // Log first vulnerability for debugging
          if (fullVulns.length > 0) {
            const firstVuln = fullVulns[0];
            console.log(`[OSV] Sample vulnerability structure:`, {
              id: firstVuln.id,
              hasSummary: !!firstVuln.summary,
              hasDetails: !!firstVuln.details,
              summaryLength: firstVuln.summary?.length || 0,
              detailsLength: firstVuln.details?.length || 0,
            });
          }
        }
      }
    } catch (error) {
      console.error(`[OSV] Error querying batch ${batchIndex + 1}:`, error);
      throw error;
    }
  }

  return vulnerabilityMap;
}

/**
 * Convert OSV API vulnerability to our format
 */
export function convertOsvVulnerability(apiVuln: OsvApiVulnerability, pkg: PackageInfo): OsvVulnerability {
  const severity = mapOsvSeverity(apiVuln);
  const cvssScore = getCvssScore(apiVuln);

  // Extract fixed versions from affected ranges
  let fixedVersions: string[] = [];

  if (apiVuln.affected && apiVuln.affected.length > 0) {
    for (const affected of apiVuln.affected) {
      if (affected.package?.name === pkg.name) {
        const versions = extractFixedVersions(affected.ranges);
        fixedVersions.push(...versions);
      }
    }
  }

  // Remove duplicates
  fixedVersions = [...new Set(fixedVersions)];

  // Extract summary - OSV API may have summary or details
  let summary = apiVuln.summary?.trim() || '';

  // If no summary, try to extract first sentence from details
  if (!summary && apiVuln.details) {
    const details = apiVuln.details.trim();

    // Try to get first sentence (up to first period, newline, or 200 chars)
    const firstSentence = details.split(/[.\n]/)[0];
    summary = firstSentence.length > 200 ? firstSentence.substring(0, 200) + '...' : firstSentence;
  }

  // Final fallback
  if (!summary) {
    summary = `Security vulnerability in ${pkg.name}`;
  }

  return {
    id: apiVuln.id,
    packageName: pkg.name,
    version: pkg.version,
    ecosystem: pkg.ecosystem,
    severity,
    summary,
    details: apiVuln.details || '',
    aliases: apiVuln.aliases || [],
    references:
      apiVuln.references?.map((ref) => ({
        type: ref.type,
        url: ref.url,
      })) || [],
    cvssScore,
    fixedVersions,
    manifestFile: pkg.manifestFile,
  };
}

/**
 * Scan packages for vulnerabilities
 */
export async function scanPackages(packages: PackageInfo[]): Promise<OsvVulnerability[]> {
  console.log(`[OSV] Scanning ${packages.length} packages for vulnerabilities...`);

  if (packages.length === 0) {
    return [];
  }

  const vulnerabilityMap = await queryOsvBatch(packages);
  const allVulnerabilities: OsvVulnerability[] = [];

  // Convert API vulnerabilities to our format
  packages.forEach((pkg) => {
    const key = `${pkg.ecosystem}:${pkg.name}@${pkg.version}`;
    const vulns = vulnerabilityMap.get(key);

    if (vulns) {
      console.log(`[OSV] Converting ${vulns.length} vulnerabilities for ${key}`);
      vulns.forEach((apiVuln, idx) => {
        const converted = convertOsvVulnerability(apiVuln, pkg);
        allVulnerabilities.push(converted);

        // Log first conversion for debugging
        if (idx === 0) {
          console.log(`[OSV] Sample converted vulnerability:`, {
            id: converted.id,
            summary: converted.summary,
            severity: converted.severity,
            hasDetails: !!converted.details,
            fixedVersions: converted.fixedVersions,
          });
        }
      });
    }
  });

  console.log(`[OSV] Found ${allVulnerabilities.length} total vulnerabilities`);

  return allVulnerabilities;
}
