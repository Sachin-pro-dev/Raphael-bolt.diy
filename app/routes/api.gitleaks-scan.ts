import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';

interface GitLeaksFinding {
  ruleId: string;
  description: string;
  startLine: number;
  endLine: number;
  secret: string; // Pre-redacted
  file: string;
  commit: string;
  author: string;
  email: string;
  date: string;
  message: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

interface GitLeaksScanResult {
  success: boolean;
  findings: GitLeaksFinding[];
  stats: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  scannedFiles: number;
  scanDuration: number;
  error?: string;
}

interface ScanRequestBody {
  files?: Array<{ path: string; content: string }>;
}

// Get GitLeaks executable path
function getGitleaksPath(): string | null {
  // Try global command first
  try {
    execSync('gitleaks version', { stdio: 'ignore' });
    return 'gitleaks';
  } catch {
    // Try Scoop installation (Windows)
    if (process.platform === 'win32') {
      const userProfile = process.env.USERPROFILE || process.env.HOME;

      if (userProfile) {
        const scoopPath = path.join(userProfile, 'scoop', 'shims', 'gitleaks.exe');

        if (existsSync(scoopPath)) {
          return scoopPath;
        }
      }
    }

    return null;
  }
}

// Check if GitLeaks is installed
function isGitleaksInstalled(): boolean {
  return getGitleaksPath() !== null;
}

// Map GitLeaks rule IDs to severity levels
function mapSeverity(ruleId: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  const ruleLower = ruleId.toLowerCase();

  // CRITICAL - Highly sensitive credentials that can cause immediate breach
  const criticalRules = [
    'aws-access-token',
    'aws-secret-key',
    'aws-access-key',
    'private-key',
    'private-key-header',
    'stripe-access-token',
    'stripe-secret-key',
    'gcp-api-key',
    'azure-client-secret',
    'rsa-private-key',
    'ssh-private-key',
    'pgp-private-key',
    'heroku-api-key',
    'mailchimp-api-key',
    'paypal-braintree-access-token',
    'picatic-api-key',
    'stripe-restricted-api-key',
    'square-access-token',
    'square-secret',
    'sumologic-access-token',
  ];

  // HIGH - API tokens and credentials that provide significant access
  const highRules = [
    'github-pat',
    'github-fine-grained-pat',
    'github-oauth',
    'gitlab-token',
    'gitlab-pat',
    'postgres-connection-string',
    'mysql-connection-string',
    'jwt-secret',
    'jwt-token',
    'jwt',
    'slack-access-token',
    'slack-webhook',
    'slack-api-token',
    'twilio-api-key',
    'sendgrid-api-token',
    'mailgun-api-key',
    'discord-api-token',
    'discord-client-secret',
    'dropbox-api-token',
    'facebook-access-token',
    'google-api-key',
    'twitter-access-token',
    'twitter-access-secret',
    'linkedin-client-secret',
    'adobe-client-secret',
    'alibaba-access-key-secret',
    'bitbucket-client-secret',
    'beamer-api-token',
    'clojars-api-token',
    'contentful-delivery-api-token',
    'databricks-api-token',
    'datadog-access-token',
    'defined-networking-api-token',
    'digitalocean-access-token',
    'digitalocean-pat',
    'doppler-api-token',
    'duffel-api-token',
    'dynatrace-api-token',
    'easypost-api-token',
    'fastly-api-token',
    'finicity-client-secret',
    'flutterwave-secret-key',
    'frameio-api-token',
    'freshbooks-access-token',
  ];

  // MEDIUM - Generic API keys and less critical tokens
  const mediumRules = [
    'generic-api-key',
    'api-key',
    'apikey',
    'api_key',
    'auth-token',
    'authorization-token',
    'bearer-token',
    'client-secret',
    'oauth-token',
    'access-token',
    'refresh-token',
    'webhook-url',
    'webhook',
    'secret-key',
    'encryption-key',
  ];

  // Check each category
  for (const rule of criticalRules) {
    if (ruleLower.includes(rule)) {
      return 'CRITICAL';
    }
  }

  for (const rule of highRules) {
    if (ruleLower.includes(rule)) {
      return 'HIGH';
    }
  }

  for (const rule of mediumRules) {
    if (ruleLower.includes(rule)) {
      return 'MEDIUM';
    }
  }

  // Default to HIGH for unknown rules (better safe than sorry)
  return 'HIGH';
}

// Redact secrets for security (NEVER show full secrets)
function redactSecret(secret: string): string {
  if (!secret || secret.length === 0) {
    return '***';
  }

  // Very short secrets - fully redact
  if (secret.length <= 8) {
    return '*'.repeat(secret.length);
  }

  // Show first 3 and last 3 characters, redact middle
  const first3 = secret.substring(0, 3);
  const last3 = secret.substring(secret.length - 3);
  const middleLength = secret.length - 6;

  return `${first3}${'*'.repeat(middleLength)}${last3}`;
}

// Calculate statistics from findings
function calculateStats(findings: GitLeaksFinding[]) {
  return {
    total: findings.length,
    critical: findings.filter((f) => f.severity === 'CRITICAL').length,
    high: findings.filter((f) => f.severity === 'HIGH').length,
    medium: findings.filter((f) => f.severity === 'MEDIUM').length,
    low: findings.filter((f) => f.severity === 'LOW').length,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const startTime = Date.now();
  let reportPath: string | null = null;
  let tempDir: string | null = null;

  try {
    console.log('[GitLeaks] Starting secret scan...');

    // Get GitLeaks executable path
    const gitleaksCmd = getGitleaksPath();

    if (!gitleaksCmd) {
      console.error('[GitLeaks] GitLeaks is not installed');

      const isWindows = process.platform === 'win32';
      const installCmd = isWindows
        ? 'Install with: scoop install gitleaks (or choco install gitleaks)'
        : 'Install with: brew install gitleaks';

      return json<GitLeaksScanResult>(
        {
          success: false,
          findings: [],
          stats: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
          scannedFiles: 0,
          scanDuration: 0,
          error: `GitLeaks is not installed.

${installCmd}

Verify: gitleaks version

For Scoop (Windows): https://scoop.sh
Run: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
     Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
     scoop install gitleaks`,
        },
        { status: 400 },
      );
    }

    console.log('[GitLeaks] Using GitLeaks at:', gitleaksCmd);

    // Parse request body to get files
    const body = (await request.json()) as ScanRequestBody;
    const { files } = body;

    console.log('[GitLeaks] Request received:', {
      filesCount: files?.length || 0,
    });

    // Create a temporary directory for scanning using OS temp dir
    tempDir = path.join(os.tmpdir(), `gitleaks-scan-${Date.now()}`);
    console.log('[GitLeaks] Creating temp directory:', tempDir);

    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }

    mkdirSync(tempDir, { recursive: true });

    // Write files to temp directory
    let fileCount = 0;

    if (files && Array.isArray(files) && files.length > 0) {
      console.log('[GitLeaks] Writing files to temp directory...');

      for (const file of files) {
        try {
          // Sanitize the file path - remove leading slashes and normalize
          const sanitizedPath = file.path.replace(/^\/+/, '').replace(/\\/g, '/');

          // Skip if no content
          if (!file.content || file.content.trim().length === 0) {
            console.log('[GitLeaks] Skipping empty file:', sanitizedPath);
            continue;
          }

          const filePath = path.join(tempDir, sanitizedPath);
          const fileDir = path.dirname(filePath);

          console.log('[GitLeaks] Writing file:', {
            original: file.path,
            sanitized: sanitizedPath,
            fullPath: filePath,
            contentLength: file.content.length,
          });

          if (!existsSync(fileDir)) {
            mkdirSync(fileDir, { recursive: true });
          }

          writeFileSync(filePath, file.content, 'utf-8');
          fileCount++;
        } catch (fileError: any) {
          console.error('[GitLeaks] Error writing file:', file.path, fileError.message);
        }
      }
    } else {
      console.error('[GitLeaks] No files provided');
      return json<GitLeaksScanResult>(
        {
          success: false,
          findings: [],
          stats: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
          scannedFiles: 0,
          scanDuration: 0,
          error: 'No files provided for scanning',
        },
        { status: 400 },
      );
    }

    // Verify files were written
    console.log('[GitLeaks] Files written:', fileCount);

    if (fileCount === 0) {
      console.error('[GitLeaks] No files to scan');

      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }

      return json<GitLeaksScanResult>(
        {
          success: false,
          findings: [],
          stats: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
          scannedFiles: 0,
          scanDuration: 0,
          error: 'No valid files to scan. All files were empty or invalid.',
        },
        { status: 400 },
      );
    }

    // Create report path in temp directory
    reportPath = path.join(tempDir, `gitleaks-report-${Date.now()}.json`);

    console.log('[GitLeaks] Report path:', reportPath);

    /*
     * Build GitLeaks command
     * Use --no-git flag to scan working directory only (fast, doesn't require git repo)
     * Use --exit-code 0 to prevent non-zero exit on findings (we want the JSON output)
     */
    const command = `"${gitleaksCmd}" detect --source "${tempDir}" --no-git --report-format json --report-path "${reportPath}" --no-banner --exit-code 0`;

    console.log('[GitLeaks] Running command:', command);
    console.log('[GitLeaks] This may take 5-30 seconds...');

    try {
      // Execute GitLeaks scan with 2 minute timeout
      execSync(command, {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
        timeout: 120000, // 2 minutes timeout
        stdio: 'pipe', // Capture output
      });

      console.log('[GitLeaks] Scan completed');
    } catch (error: any) {
      /*
       * GitLeaks may exit with non-zero even with --exit-code 0 flag on some errors
       * Check if report file was created
       */
      if (!existsSync(reportPath)) {
        console.error('[GitLeaks] Command failed and no report generated:', error.message);
        throw error;
      }

      console.log('[GitLeaks] Command completed (non-zero exit but report exists)');
    }

    // Parse results from JSON report
    console.log('[GitLeaks] Reading report file...');

    if (!existsSync(reportPath)) {
      console.log('[GitLeaks] No report file found - no secrets detected');

      // Clean up temp directory
      if (tempDir && existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }

      return json<GitLeaksScanResult>({
        success: true,
        findings: [],
        stats: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        scannedFiles: fileCount,
        scanDuration: Date.now() - startTime,
      });
    }

    const reportContent = readFileSync(reportPath, 'utf-8');

    // GitLeaks returns empty array when no secrets found, or array of findings
    let rawFindings: any[] = [];

    try {
      const parsed = JSON.parse(reportContent);
      rawFindings = Array.isArray(parsed) ? parsed : [];
    } catch (parseError) {
      console.error('[GitLeaks] Failed to parse report:', parseError);
      rawFindings = [];
    }

    console.log('[GitLeaks] Raw findings:', rawFindings.length);

    // Map and redact findings
    const findings: GitLeaksFinding[] = rawFindings.map((finding) => {
      const severity = mapSeverity(finding.RuleID || finding.Rule || 'unknown');
      const redactedSecret = redactSecret(finding.Secret || '');

      // Clean the file path to remove temp directory prefix
      const cleanFile = (finding.File || finding.Path || 'unknown').replace(/.*[\\\/]gitleaks-scan-\d+[\\\/]/, '');

      return {
        ruleId: finding.RuleID || finding.Rule || 'unknown',
        description: finding.Description || 'Potential secret detected',
        startLine: finding.StartLine || finding.LineNumber || 0,
        endLine: finding.EndLine || finding.StartLine || finding.LineNumber || 0,
        secret: redactedSecret, // CRITICAL: Always redacted
        file: cleanFile,
        commit: finding.Commit || 'uncommitted',
        author: finding.Author || 'unknown',
        email: finding.Email || '',
        date: finding.Date || new Date().toISOString(),
        message: finding.Message || '',
        severity,
      };
    });

    const stats = calculateStats(findings);
    const scanDuration = Date.now() - startTime;

    console.log('[GitLeaks] Results:', {
      totalFindings: findings.length,
      critical: stats.critical,
      high: stats.high,
      medium: stats.medium,
      low: stats.low,
      scannedFiles: fileCount,
      scanDuration: `${(scanDuration / 1000).toFixed(2)}s`,
    });

    // Clean up temp directory
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
      console.log('[GitLeaks] Cleaned up temp directory');
    }

    return json<GitLeaksScanResult>({
      success: true,
      findings,
      stats,
      scannedFiles: fileCount,
      scanDuration,
    });
  } catch (error: any) {
    console.error('[GitLeaks] Unexpected error:', error);

    // Clean up temp directory on error
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }

    return json<GitLeaksScanResult>(
      {
        success: false,
        findings: [],
        stats: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        scannedFiles: 0,
        scanDuration: Date.now() - startTime,
        error: error.message || 'Unknown error occurred during scan',
      },
      { status: 500 },
    );
  }
}

// Health check endpoint
export async function loader() {
  const isInstalled = isGitleaksInstalled();

  return json({
    available: isInstalled,
    message: isInstalled ? 'GitLeaks is available' : 'GitLeaks is not installed',
  });
}
