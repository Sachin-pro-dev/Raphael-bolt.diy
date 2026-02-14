import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'fs';
import path from 'path';
import os from 'os';

interface SemgrepFinding {
  ruleId: string;
  message: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  filePath: string;
  line: number;
  column: number;
  code: string;
  fix?: string;
  cwe?: string;
  owasp?: string;
}

interface SemgrepScanResult {
  success: boolean;
  findings: SemgrepFinding[];
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
  debug?: string;
}

interface ScanRequestBody {
  files?: Array<{ path: string; content: string }>;
  code?: string;
  language?: string;
}

// Check if Semgrep is installed
function isSemgrepInstalled(): boolean {
  try {
    execSync('semgrep --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Parse Semgrep JSON output
function parseSemgrepOutput(output: string): SemgrepFinding[] {
  try {
    const result = JSON.parse(output);
    const findings: SemgrepFinding[] = [];

    if (result.results) {
      for (const finding of result.results) {
        findings.push({
          ruleId: finding.check_id || 'unknown',
          message: finding.extra?.message || 'No message',
          severity: (finding.extra?.severity?.toUpperCase() || 'INFO') as 'ERROR' | 'WARNING' | 'INFO',
          filePath: finding.path || '',
          line: finding.start?.line || 0,
          column: finding.start?.col || 0,
          code: finding.extra?.lines || '',
          fix: finding.extra?.metadata?.fix || undefined,
          cwe: finding.extra?.metadata?.cwe || undefined,
          owasp: finding.extra?.metadata?.owasp || undefined,
        });
      }
    }

    return findings;
  } catch (error) {
    console.error('Failed to parse Semgrep output:', error);
    return [];
  }
}

// Calculate statistics from findings
function calculateStats(findings: SemgrepFinding[]) {
  return {
    total: findings.length,
    critical: findings.filter((f) => f.severity === 'ERROR').length,
    high: findings.filter((f) => f.severity === 'WARNING').length,
    medium: findings.filter((f) => f.severity === 'INFO').length,
    low: 0,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const startTime = Date.now();
  let tempDir: string | null = null;

  try {
    console.log('[Semgrep] Starting scan...');

    // Check if Semgrep is installed
    if (!isSemgrepInstalled()) {
      console.error('[Semgrep] Semgrep is not installed');
      return json<SemgrepScanResult>(
        {
          success: false,
          findings: [],
          stats: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
          scannedFiles: 0,
          scanDuration: 0,
          error: 'Semgrep is not installed. Please install it using: pip install semgrep',
        },
        { status: 400 },
      );
    }

    const body = (await request.json()) as ScanRequestBody;
    const { files, code, language } = body;

    console.log('[Semgrep] Request received:', {
      filesCount: files?.length || 0,
      hasCode: !!code,
      language,
    });

    // Create a temporary directory for scanning using OS temp dir
    tempDir = path.join(os.tmpdir(), `semgrep-scan-${Date.now()}`);
    console.log('[Semgrep] Creating temp directory:', tempDir);

    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }

    mkdirSync(tempDir, { recursive: true });

    // Write files to temp directory
    let fileCount = 0;

    if (files && Array.isArray(files) && files.length > 0) {
      console.log('[Semgrep] Writing files to temp directory...');

      for (const file of files) {
        try {
          // Sanitize the file path - remove leading slashes and normalize
          const sanitizedPath = file.path.replace(/^\/+/, '').replace(/\\/g, '/');

          // Skip if no content
          if (!file.content || file.content.trim().length === 0) {
            console.log('[Semgrep] Skipping empty file:', sanitizedPath);
            continue;
          }

          const filePath = path.join(tempDir, sanitizedPath);
          const fileDir = path.dirname(filePath);

          console.log('[Semgrep] Writing file:', {
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
          console.error('[Semgrep] Error writing file:', file.path, fileError.message);
        }
      }
    } else if (code && language) {
      console.log('[Semgrep] Writing single code snippet...');

      // Single code snippet
      const ext = language === 'typescript' ? 'ts' : language === 'javascript' ? 'js' : language;

      const filePath = path.join(tempDir, `code.${ext}`);
      writeFileSync(filePath, code, 'utf-8');
      fileCount = 1;
      console.log('[Semgrep] Wrote code snippet to:', filePath);
    } else {
      console.error('[Semgrep] No files or code provided');
      return json<SemgrepScanResult>(
        {
          success: false,
          findings: [],
          stats: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
          scannedFiles: 0,
          scanDuration: 0,
          error: 'No files or code provided for scanning',
        },
        { status: 400 },
      );
    }

    // Verify files were written
    console.log('[Semgrep] Files written:', fileCount);

    try {
      const tempFiles = readdirSync(tempDir, { recursive: true });
      console.log('[Semgrep] Temp directory contents:', tempFiles);
    } catch (e) {
      console.error('[Semgrep] Could not read temp directory:', e);
    }

    if (fileCount === 0) {
      console.error('[Semgrep] No files to scan');

      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }

      return json<SemgrepScanResult>(
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

    // Build Semgrep command with proper path quoting for Windows
    const configPath = path.join(process.cwd(), '.semgrep', 'ai-security.yml');
    console.log('[Semgrep] Config path:', configPath);
    console.log('[Semgrep] Config exists:', existsSync(configPath));

    // Use only custom config for now to avoid network issues
    const ruleConfigs = [`--config="${configPath}"`];

    // Use process env for command execution
    const env = { ...process.env };

    // Quote paths for Windows
    const semgrepCmd = `semgrep ${ruleConfigs.join(' ')} --json "${tempDir}"`;
    console.log('[Semgrep] Running command:', semgrepCmd);

    try {
      const output = execSync(semgrepCmd, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 60000,
        env,
      });

      console.log('[Semgrep] Scan completed successfully');

      const findings = parseSemgrepOutput(output);
      const stats = calculateStats(findings);
      const scanDuration = Date.now() - startTime;

      console.log('[Semgrep] Results:', {
        totalFindings: findings.length,
        critical: stats.critical,
        high: stats.high,
        medium: stats.medium,
      });

      // Clean up temp directory
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }

      return json<SemgrepScanResult>({
        success: true,
        findings,
        stats,
        scannedFiles: fileCount,
        scanDuration,
      });
    } catch (error: any) {
      console.error('[Semgrep] Command error:', error.message);
      console.error('[Semgrep] stderr:', error.stderr);
      console.error('[Semgrep] stdout:', error.stdout);

      /*
       * Semgrep returns non-zero exit code when findings are found
       * So we need to check if there's valid JSON output
       */
      if (error.stdout) {
        try {
          console.log('[Semgrep] Parsing output from stdout...');

          const findings = parseSemgrepOutput(error.stdout);
          const stats = calculateStats(findings);
          const scanDuration = Date.now() - startTime;

          console.log('[Semgrep] Successfully parsed findings:', findings.length);
          console.log('[Semgrep] Results:', {
            totalFindings: findings.length,
            critical: stats.critical,
            high: stats.high,
            medium: stats.medium,
          });

          // Clean up temp directory
          if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true });
          }

          return json<SemgrepScanResult>({
            success: true,
            findings,
            stats,
            scannedFiles: fileCount,
            scanDuration,
          });
        } catch (parseError: any) {
          console.error('[Semgrep] Failed to parse output:', parseError.message);
        }
      }

      // Clean up temp directory
      if (tempDir && existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }

      const errorMessage = error.stderr || error.message || 'Semgrep scan failed';
      console.error('[Semgrep] Final error:', errorMessage);

      return json<SemgrepScanResult>(
        {
          success: false,
          findings: [],
          stats: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
          scannedFiles: fileCount,
          scanDuration: Date.now() - startTime,
          error: `Command failed: ${errorMessage}`,
          debug: `stdout: ${error.stdout || 'none'}, stderr: ${error.stderr || 'none'}`,
        },
        { status: 500 },
      );
    }
  } catch (error: any) {
    console.error('[Semgrep] Unexpected error:', error);

    // Clean up temp directory
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }

    return json<SemgrepScanResult>(
      {
        success: false,
        findings: [],
        stats: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        scannedFiles: 0,
        scanDuration: Date.now() - startTime,
        error: error.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
}

// Health check endpoint
export async function loader() {
  const isInstalled = isSemgrepInstalled();

  return json({
    available: isInstalled,
    message: isInstalled ? 'Semgrep is available' : 'Semgrep is not installed',
  });
}
