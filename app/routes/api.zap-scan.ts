import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { execSync } from 'child_process';
import { existsSync, rmSync, readFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import path from 'path';
import os from 'os';
import { deployToVercel, isVercelConfigured, getVercelProjectInfo } from '~/lib/.server/vercel-deploy';

interface ZapAlert {
  id: string;
  name: string;
  riskdesc: string;
  risk: 'High' | 'Medium' | 'Low' | 'Informational';
  confidence: string;
  desc: string;
  solution: string;
  reference: string;
  cweid: string;
  wascid: string;
  instances: Array<{
    uri: string;
    method: string;
    param: string;
    attack: string;
    evidence: string;
  }>;
}

interface ZapScanResult {
  success: boolean;
  alerts: ZapAlert[];
  stats: {
    total: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  scanDuration: number;
  targetUrl: string;
  error?: string;
}

interface ScanRequestBody {
  targetUrl?: string;
  autoDeploy?: boolean; // Auto-deploy to Vercel before scanning
}

// Check if Docker is installed and running
function isDockerAvailable(): boolean {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    execSync('docker ps', { stdio: 'ignore' });

    return true;
  } catch {
    return false;
  }
}

/*
 * Get host machine IP address for Docker container to access
 * Always use host.docker.internal with --add-host flag
 * This is the most reliable method across all Docker Desktop platforms
 * Docker bridge IPs (172.x.x.x) won't work because dev server binds to localhost only
 */
function getHostIPForDocker(): string {
  console.log('[ZAP] Using host.docker.internal (with --add-host=host.docker.internal:host-gateway)');

  return 'host.docker.internal';
}

// Validate that target URL is a valid HTTP/HTTPS URL
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Check if URL is localhost (for information purposes)
function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const localhostHosts = ['localhost', '127.0.0.1', 'host.docker.internal', '0.0.0.0'];

    return localhostHosts.includes(parsed.hostname);
  } catch {
    return false;
  }
}

// Parse ZAP JSON report
function parseZapReport(reportPath: string): ZapAlert[] {
  try {
    console.log('[ZAP] Reading report file...');

    const reportContent = readFileSync(reportPath, 'utf-8');

    console.log('[ZAP] Report content length:', reportContent.length, 'characters');
    console.log('[ZAP] Parsing JSON...');

    const report = JSON.parse(reportContent);

    console.log('[ZAP] JSON parsed successfully');
    console.log('[ZAP] Report structure:', {
      hasSite: !!report.site,
      siteCount: report.site?.length || 0,
      hasAlerts: !!(report.site && report.site[0]?.alerts),
    });

    const alerts: ZapAlert[] = [];
    const riskCodeCounts: Record<string, number> = {};

    if (report.site && Array.isArray(report.site)) {
      console.log('[ZAP] Processing', report.site.length, 'site(s)...');

      for (const site of report.site) {
        if (site.alerts && Array.isArray(site.alerts)) {
          console.log('[ZAP] Found', site.alerts.length, 'alert(s) in site');

          for (const alert of site.alerts) {
            // Track risk codes for debugging
            const riskCodeKey = `riskcode_${alert.riskcode}`;
            riskCodeCounts[riskCodeKey] = (riskCodeCounts[riskCodeKey] || 0) + 1;

            /*
             * ZAP uses riskcode (0-3) for risk levels
             * 0 = Informational, 1 = Low, 2 = Medium, 3 = High
             */
            let riskLevel: 'High' | 'Medium' | 'Low' | 'Informational' = 'Informational';

            if (alert.riskcode !== undefined) {
              // Use numeric riskcode (most reliable)
              const code = parseInt(alert.riskcode);

              switch (code) {
                case 3:
                  riskLevel = 'High';
                  break;
                case 2:
                  riskLevel = 'Medium';
                  break;
                case 1:
                  riskLevel = 'Low';
                  break;
                case 0:
                default:
                  riskLevel = 'Informational';
                  break;
              }

              console.log(`[ZAP] Alert "${alert.name || alert.alert}": riskcode=${code} → ${riskLevel}`);
            } else if (alert.risk) {
              // Fallback to text risk field if available
              const riskText = alert.risk.toLowerCase();

              if (riskText.includes('high')) {
                riskLevel = 'High';
              } else if (riskText.includes('medium')) {
                riskLevel = 'Medium';
              } else if (riskText.includes('low')) {
                riskLevel = 'Low';
              } else {
                riskLevel = 'Informational';
              }

              console.log(`[ZAP] Alert "${alert.name || alert.alert}": risk="${alert.risk}" → ${riskLevel}`);
            } else {
              console.log(
                `[ZAP] Alert "${alert.name || alert.alert}": NO risk info found, defaulting to Informational`,
              );
            }

            const processedAlert: ZapAlert = {
              id: alert.pluginid || alert.id || 'unknown',
              name: alert.name || alert.alert || 'Unknown Alert',
              riskdesc: alert.riskdesc || `${riskLevel} (${alert.confidence || 'Unknown'})`,
              risk: riskLevel,
              confidence: alert.confidence || 'Unknown',
              desc: alert.desc || 'No description available',
              solution: alert.solution || 'No solution provided',
              reference: alert.reference || '',
              cweid: alert.cweid || '',
              wascid: alert.wascid || '',
              instances: (alert.instances || []).map((instance: any) => ({
                uri: instance.uri || '',
                method: instance.method || '',
                param: instance.param || '',
                attack: instance.attack || '',
                evidence: instance.evidence || '',
              })),
            };

            alerts.push(processedAlert);
          }
        }
      }
    }

    console.log('[ZAP] Total alerts extracted:', alerts.length);
    console.log('[ZAP] Risk code distribution:', riskCodeCounts);

    // Log final categorization
    const finalStats = {
      High: alerts.filter((a) => a.risk === 'High').length,
      Medium: alerts.filter((a) => a.risk === 'Medium').length,
      Low: alerts.filter((a) => a.risk === 'Low').length,
      Informational: alerts.filter((a) => a.risk === 'Informational').length,
    };
    console.log('[ZAP] Final risk categorization:', finalStats);

    return alerts;
  } catch (error: any) {
    console.error('[ZAP] ❌ Failed to parse report');
    console.error('[ZAP] Error:', error?.message);
    console.error('[ZAP] Stack:', error?.stack);

    return [];
  }
}

// Calculate statistics from alerts
function calculateStats(alerts: ZapAlert[]) {
  return {
    total: alerts.length,
    high: alerts.filter((a) => a.risk === 'High').length,
    medium: alerts.filter((a) => a.risk === 'Medium').length,
    low: alerts.filter((a) => a.risk === 'Low').length,
    info: alerts.filter((a) => a.risk === 'Informational').length,
  };
}

// Get the ZAP reports directory (inside project root)
function getZapReportsDir(): string {
  // Use project root .zap-reports directory instead of system temp
  const projectRoot = process.cwd();
  const zapDir = path.join(projectRoot, '.zap-reports');

  // Ensure directory exists
  if (!existsSync(zapDir)) {
    mkdirSync(zapDir, { recursive: true });
    console.log('[ZAP] Created .zap-reports directory:', zapDir);
  }

  return zapDir;
}

// Clean up old ZAP reports
function cleanupOldReports(reportsDir: string) {
  try {
    const files = readdirSync(reportsDir).filter((f: string) => f.startsWith('zap-report-') && f.endsWith('.json'));

    let cleanedCount = 0;

    for (const file of files) {
      const fullPath = path.join(reportsDir, file);

      if (existsSync(fullPath)) {
        rmSync(fullPath, { force: true });
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[ZAP] Cleaned up ${cleanedCount} old report(s)`);
    }
  } catch {
    console.log('[ZAP] Note: Could not clean old reports (non-critical)');
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const startTime = Date.now();
  let reportPath: string | null = null;

  try {
    console.log('='.repeat(80));
    console.log('[ZAP] DAST SCAN STARTED');
    console.log('[ZAP] Timestamp:', new Date().toISOString());
    console.log('='.repeat(80));

    // Check if Docker is available
    console.log('[ZAP] Step 1: Checking Docker availability...');

    if (!isDockerAvailable()) {
      console.error('[ZAP] ❌ Docker is not available');
      console.error('[ZAP] Docker must be installed and running to perform DAST scans');
      console.log('='.repeat(80));

      return json<ZapScanResult>(
        {
          success: false,
          alerts: [],
          stats: { total: 0, high: 0, medium: 0, low: 0, info: 0 },
          scanDuration: 0,
          targetUrl: '',
          error:
            'Docker is not installed or not running. Please install Docker and start the Docker daemon to run DAST scans.',
        },
        { status: 400 },
      );
    }

    console.log('[ZAP] ✓ Docker is available');

    console.log('[ZAP] Step 2: Parsing request body...');

    const body = (await request.json()) as ScanRequestBody;
    let originalTargetUrl = body.targetUrl;
    const autoDeploy = body.autoDeploy || false;

    console.log('[ZAP] ✓ Request parsed successfully');
    console.log('[ZAP] Auto-deploy enabled?', autoDeploy);

    // Handle auto-deploy to Vercel
    if (autoDeploy) {
      console.log('[ZAP] Step 2a: Auto-deploying to Vercel...');

      // Check if Vercel is configured
      if (!isVercelConfigured()) {
        console.error('[ZAP] ❌ Vercel not configured');
        console.log('='.repeat(80));

        return json<ZapScanResult>(
          {
            success: false,
            alerts: [],
            stats: { total: 0, high: 0, medium: 0, low: 0, info: 0 },
            scanDuration: 0,
            targetUrl: '',
            error:
              'Vercel is not configured for this project.\n\nSetup:\n1. Install Vercel CLI: npm install -g vercel\n2. Login: vercel login\n3. Link project: vercel link\n\nThen try again!',
          },
          { status: 400 },
        );
      }

      const projectInfo = getVercelProjectInfo();
      console.log('[ZAP] Vercel project:', projectInfo.projectName);

      // Deploy to Vercel
      const deployResult = await deployToVercel();

      if (!deployResult.success) {
        console.error('[ZAP] ❌ Vercel deployment failed');
        console.error('[ZAP] Error:', deployResult.error);
        console.log('='.repeat(80));

        return json<ZapScanResult>(
          {
            success: false,
            alerts: [],
            stats: { total: 0, high: 0, medium: 0, low: 0, info: 0 },
            scanDuration: Date.now() - startTime,
            targetUrl: '',
            error: `Auto-deploy failed: ${deployResult.error}`,
          },
          { status: 500 },
        );
      }

      originalTargetUrl = deployResult.url!;
      console.log('[ZAP] ✓ Auto-deployed to:', originalTargetUrl);
    }

    // Require URL to be provided (either from user or auto-deploy)
    if (!originalTargetUrl) {
      console.error('[ZAP] ❌ No target URL provided');
      console.log('='.repeat(80));

      return json<ZapScanResult>(
        {
          success: false,
          alerts: [],
          stats: { total: 0, high: 0, medium: 0, low: 0, info: 0 },
          scanDuration: 0,
          targetUrl: '',
          error: 'Please provide a target URL to scan or enable auto-deploy',
        },
        { status: 400 },
      );
    }

    console.log('[ZAP] Target URL:', originalTargetUrl);

    // Validate URL format
    console.log('[ZAP] Step 3: Validating target URL...');

    if (!isValidUrl(originalTargetUrl)) {
      console.error('[ZAP] ❌ Invalid URL format');
      console.error('[ZAP] Provided URL:', originalTargetUrl);
      console.log('='.repeat(80));

      return json<ZapScanResult>(
        {
          success: false,
          alerts: [],
          stats: { total: 0, high: 0, medium: 0, low: 0, info: 0 },
          scanDuration: 0,
          targetUrl: originalTargetUrl,
          error: 'Invalid URL format. Please provide a valid HTTP or HTTPS URL.',
        },
        { status: 400 },
      );
    }

    const isLocalhost = isLocalhostUrl(originalTargetUrl);
    console.log('[ZAP] ✓ URL format is valid');
    console.log('[ZAP] Is localhost?', isLocalhost);

    if (isLocalhost) {
      console.log('[ZAP] ⚠️  Warning: Scanning localhost may have network issues with Docker');
      console.log('[ZAP] ⚠️  Consider scanning a hosted deployment (Vercel, Netlify, etc.) instead');
    }

    // Check if target URL is reachable (use localhost version for host-side check)
    console.log('[ZAP] Step 4: Checking target reachability...');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const fetchStartTime = Date.now();

      await fetch(originalTargetUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const fetchDuration = Date.now() - fetchStartTime;

      console.log('[ZAP] ✓ Target URL is reachable');
      console.log('[ZAP] Response time:', fetchDuration, 'ms');
    } catch (reachError: any) {
      console.error('[ZAP] ❌ Target URL is not reachable');
      console.error('[ZAP] Error:', reachError.message);
      console.log('='.repeat(80));

      return json<ZapScanResult>(
        {
          success: false,
          alerts: [],
          stats: { total: 0, high: 0, medium: 0, low: 0, info: 0 },
          scanDuration: 0,
          targetUrl: originalTargetUrl,
          error: `Target URL ${originalTargetUrl} is not reachable. Please ensure your development server is running.`,
        },
        { status: 400 },
      );
    }

    // Prepare URL for Docker scanning
    let dockerTargetUrl = originalTargetUrl;

    // Only convert localhost URLs - public URLs work as-is
    if (isLocalhost) {
      const dockerHost = getHostIPForDocker();
      dockerTargetUrl = originalTargetUrl.replace('localhost', dockerHost).replace('127.0.0.1', dockerHost);
      console.log('[ZAP] Converted localhost URL for Docker container:', originalTargetUrl, '->', dockerTargetUrl);
      console.log('[ZAP] Using Docker host:', dockerHost);
    } else {
      console.log('[ZAP] Scanning public URL directly (no conversion needed)');
    }

    // Clean up old reports
    console.log('[ZAP] Step 5: Cleaning up old report files...');

    const zapReportsDir = getZapReportsDir();
    cleanupOldReports(zapReportsDir);
    console.log('[ZAP] ✓ Cleanup complete');

    // Generate unique report path
    const reportFilename = `zap-report-${Date.now()}.json`;
    reportPath = path.join(zapReportsDir, reportFilename);

    console.log('[ZAP] Step 6: Preparing report output...');
    console.log('[ZAP] Report filename:', reportFilename);
    console.log('[ZAP] Report path:', reportPath);
    console.log('[ZAP] Reports directory:', zapReportsDir);

    // Pull ZAP Docker image if not present
    console.log('[ZAP] Step 7: Verifying ZAP Docker image...');

    try {
      execSync('docker image inspect zaproxy/zap-stable', { stdio: 'ignore' });
      console.log('[ZAP] ✓ ZAP image is already available locally');
    } catch {
      console.log('[ZAP] ⚠️  ZAP image not found locally');
      console.log('[ZAP] Pulling zaproxy/zap-stable image...');
      console.log('[ZAP] This may take 2-5 minutes on first run (~500MB download)');

      try {
        const pullStartTime = Date.now();

        execSync('docker pull zaproxy/zap-stable', {
          stdio: 'inherit',
          timeout: 300000, // 5 minutes
        });

        const pullDuration = Date.now() - pullStartTime;

        console.log('[ZAP] ✓ ZAP image pulled successfully');
        console.log('[ZAP] Pull duration:', Math.round(pullDuration / 1000), 'seconds');
      } catch (pullError: any) {
        console.error('[ZAP] ❌ Failed to pull ZAP image');
        console.error('[ZAP] Error:', pullError.message);
        console.log('='.repeat(80));

        return json<ZapScanResult>(
          {
            success: false,
            alerts: [],
            stats: { total: 0, high: 0, medium: 0, low: 0, info: 0 },
            scanDuration: Date.now() - startTime,
            targetUrl: originalTargetUrl,
            error: 'Failed to pull OWASP ZAP Docker image. Please check your internet connection.',
          },
          { status: 500 },
        );
      }
    }

    /*
     * Run ZAP baseline scan
     * Use volume mount to get report out of container
     */
    console.log('[ZAP] Step 8: Starting ZAP baseline scan...');
    console.log('[ZAP] Scan type: Baseline (passive scanning)');
    console.log('[ZAP] Expected duration: 5-10 minutes');

    // Normalize path for Docker (convert Windows paths to Unix format for Docker)
    let volumePath = zapReportsDir;

    if (process.platform === 'win32') {
      // Convert C:\Users\... to /c/Users/... for Docker on Windows
      volumePath = volumePath.replace(/\\/g, '/').replace(/^([A-Z]):/, (match, drive) => `/${drive.toLowerCase()}`);
    }

    console.log('[ZAP] Original reports path:', zapReportsDir);
    console.log('[ZAP] Docker volume path:', volumePath);

    // Build Docker command
    const dockerCmdParts = ['docker run --rm'];

    // Only add host mapping and network mode for localhost URLs
    if (isLocalhost) {
      dockerCmdParts.push('--add-host=host.docker.internal:host-gateway');

      if (process.platform === 'win32') {
        dockerCmdParts.push('--network=bridge');
      }
    }

    // Add volume mount
    dockerCmdParts.push(`-v "${volumePath}:/zap/wrk/:rw"`);

    // Add ZAP command and arguments
    dockerCmdParts.push(
      'zaproxy/zap-stable',
      'zap-baseline.py',
      `-t ${dockerTargetUrl}`,
      `-r ${reportFilename.replace('.json', '.html')}`, // HTML report for debugging
      `-J ${reportFilename}`,
      '-I', // Ignore warnings (non-zero exit codes)
    );

    const zapCmd = dockerCmdParts.join(' ');

    console.log('[ZAP] Docker command:');
    console.log('[ZAP]', zapCmd);
    console.log('[ZAP] Volume path:', volumePath);
    console.log('[ZAP] Docker target URL:', dockerTargetUrl);

    /*
     * Test connectivity from Docker to target URL before running full scan
     */
    console.log('[ZAP] Step 8.5: Testing connectivity to target URL...');

    try {
      // Build test command
      const testCmdParts = ['docker', 'run', '--rm'];

      // Only add host mapping for localhost URLs
      if (isLocalhost) {
        testCmdParts.push('--add-host=host.docker.internal:host-gateway');

        if (process.platform === 'win32') {
          testCmdParts.push('--network=bridge');
        }
      }

      testCmdParts.push(
        'curlimages/curl:latest',
        'curl',
        '-f', // Fail on HTTP errors
        '-s', // Silent mode
        '-m',
        '10', // 10 second timeout
        '-L', // Follow redirects
        dockerTargetUrl,
      );

      const testCmd = testCmdParts.join(' ');

      console.log('[ZAP] Test command:', testCmd);

      execSync(testCmd, {
        encoding: 'utf-8',
        timeout: 15000,
        stdio: 'pipe',
      });

      console.log('[ZAP] ✓ Docker container can reach target URL');
      console.log('[ZAP] Response received, target is accessible');
    } catch (testError: any) {
      console.error('[ZAP] ❌ Cannot reach target URL from Docker');
      console.error('[ZAP] Test error:', testError.message);

      // For localhost, this is expected and we continue
      if (isLocalhost) {
        console.log('[ZAP] ⚠️  Localhost connectivity failed (common issue)');
        console.log('[ZAP] ⚠️  Consider using a hosted deployment URL instead');
        console.log('[ZAP] ⚠️  Proceeding anyway - ZAP will provide detailed errors if needed');
      } else {
        // For public URLs, connectivity failure is a real issue
        console.log('='.repeat(80));

        return json<ZapScanResult>(
          {
            success: false,
            alerts: [],
            stats: { total: 0, high: 0, medium: 0, low: 0, info: 0 },
            scanDuration: Date.now() - startTime,
            targetUrl: originalTargetUrl,
            error: `Cannot reach ${originalTargetUrl}. Please verify:\n1. The URL is correct and publicly accessible\n2. The website is online\n3. There are no firewalls blocking access\n4. The URL includes http:// or https://`,
          },
          { status: 400 },
        );
      }
    }

    console.log('[ZAP] Starting scan now...');

    const scanStartTime = Date.now();
    let scanOutput = '';
    let scanStderr = '';

    try {
      const output = execSync(zapCmd, {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 600000, // 10 minutes
      });

      scanOutput = output;

      const scanDuration = Date.now() - scanStartTime;

      console.log('[ZAP] ✓ Scan completed successfully');
      console.log('[ZAP] Scan duration:', Math.round(scanDuration / 1000), 'seconds');

      if (output && output.length > 0) {
        console.log('[ZAP] Scan output preview:', output.slice(0, 500));
      }
    } catch (scanError: any) {
      const scanDuration = Date.now() - scanStartTime;
      scanOutput = scanError.stdout || '';
      scanStderr = scanError.stderr || '';

      // ZAP returns non-zero exit code when alerts are found, so we need to check if report exists
      console.log('[ZAP] ⚠️  Command exited with non-zero code');
      console.log('[ZAP] This is normal if security alerts were found');
      console.log('[ZAP] Scan duration:', Math.round(scanDuration / 1000), 'seconds');

      // Wait a moment for the file to be written
      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (!existsSync(reportPath)) {
        console.error('[ZAP] ❌ Scan failed - no report generated');
        console.error('[ZAP] Error type:', scanError?.constructor?.name);
        console.error('[ZAP] Error message:', scanError.message);

        if (scanStderr) {
          console.error('[ZAP] stderr output:', scanStderr.slice(0, 2000));
        }

        if (scanOutput) {
          console.log('[ZAP] stdout output:', scanOutput.slice(0, 2000));
        }

        // List temp directory contents for debugging
        try {
          const tempFiles = readdirSync(os.tmpdir()).filter((f: string) => f.includes('zap'));

          console.log('[ZAP] ZAP-related files in temp:', tempFiles.join(', ') || 'none');
        } catch {
          // Ignore
        }

        console.log('='.repeat(80));

        return json<ZapScanResult>(
          {
            success: false,
            alerts: [],
            stats: { total: 0, high: 0, medium: 0, low: 0, info: 0 },
            scanDuration: Date.now() - startTime,
            targetUrl: originalTargetUrl,
            error: `ZAP scan failed: ${scanError.message}\n\nThis might be a Docker volume mounting issue. Please check:\n1. Docker Desktop is running\n2. File sharing is enabled for ${zapReportsDir}\n3. Try running the scan again`,
          },
          { status: 500 },
        );
      }

      console.log('[ZAP] ✓ Report file found despite non-zero exit (this is expected)');
    }

    // Parse report
    console.log('[ZAP] Step 9: Parsing scan report...');

    if (!existsSync(reportPath)) {
      console.error('[ZAP] ❌ Report file not found at expected location');
      console.error('[ZAP] Expected path:', reportPath);
      console.error('[ZAP] Reports directory:', zapReportsDir);

      try {
        const zapFiles = readdirSync(zapReportsDir).filter((f: string) => f.includes('zap'));

        console.log('[ZAP] ZAP files in reports directory:', zapFiles.join(', ') || 'none');
      } catch {
        console.log('[ZAP] No ZAP files found in reports directory');
      }

      console.log('='.repeat(80));

      return json<ZapScanResult>(
        {
          success: false,
          alerts: [],
          stats: { total: 0, high: 0, medium: 0, low: 0, info: 0 },
          scanDuration: Date.now() - startTime,
          targetUrl: originalTargetUrl,
          error: 'Scan completed but report file was not generated',
        },
        { status: 500 },
      );
    }

    console.log('[ZAP] ✓ Report file found');

    let reportSizeBytes = '0';

    try {
      const stats = statSync(reportPath);
      reportSizeBytes = stats.size.toString();
    } catch {
      reportSizeBytes = 'unknown';
    }

    console.log('[ZAP] Report size:', reportSizeBytes, 'bytes');

    const alerts = parseZapReport(reportPath);
    const stats = calculateStats(alerts);
    const scanDuration = Date.now() - startTime;

    console.log('[ZAP] ✓ Report parsed successfully');
    console.log('[ZAP] Step 10: Generating summary...');
    console.log('='.repeat(80));
    console.log('[ZAP] SCAN SUMMARY:');
    console.log('[ZAP] Target URL:', originalTargetUrl);
    console.log('[ZAP] Docker URL:', dockerTargetUrl);
    console.log('[ZAP] Total Alerts:', alerts.length);
    console.log('[ZAP] - High Risk:', stats.high);
    console.log('[ZAP] - Medium Risk:', stats.medium);
    console.log('[ZAP] - Low Risk:', stats.low);
    console.log('[ZAP] - Informational:', stats.info);
    console.log('[ZAP] Total Scan Duration:', Math.round(scanDuration / 1000), 'seconds');
    console.log('='.repeat(80));

    // Clean up report file
    console.log('[ZAP] Step 11: Cleaning up report file...');

    if (existsSync(reportPath)) {
      rmSync(reportPath, { force: true });
      console.log('[ZAP] ✓ Report file deleted');
    }

    console.log('[ZAP] ✓ DAST scan completed successfully');

    return json<ZapScanResult>({
      success: true,
      alerts,
      stats,
      scanDuration,
      targetUrl: originalTargetUrl,
    });
  } catch (error: any) {
    console.error('='.repeat(80));
    console.error('[ZAP] ❌ UNEXPECTED ERROR');
    console.error('[ZAP] Error type:', error?.constructor?.name);
    console.error('[ZAP] Error message:', error?.message);

    if (error?.stack) {
      console.error('[ZAP] Stack trace:', error.stack);
    }

    if (error?.code) {
      console.error('[ZAP] Error code:', error.code);
    }

    console.error('='.repeat(80));

    // Clean up report file
    if (reportPath && existsSync(reportPath)) {
      console.log('[ZAP] Cleaning up report file after error...');
      rmSync(reportPath, { force: true });
    }

    return json<ZapScanResult>(
      {
        success: false,
        alerts: [],
        stats: { total: 0, high: 0, medium: 0, low: 0, info: 0 },
        scanDuration: Date.now() - startTime,
        targetUrl: '',
        error: error.message || 'Unknown error occurred during DAST scan',
      },
      { status: 500 },
    );
  }
}

// Health check endpoint
export async function loader() {
  const dockerAvailable = isDockerAvailable();

  return json({
    available: dockerAvailable,
    message: dockerAvailable ? 'OWASP ZAP is available' : 'Docker is not installed or not running',
  });
}
