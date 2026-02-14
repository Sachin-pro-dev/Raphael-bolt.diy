import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

interface VercelDeployResult {
  success: boolean;
  url?: string;
  error?: string;
  logs?: string;
}

// Check if Vercel is configured for this project
export function isVercelConfigured(): boolean {
  const projectRoot = process.cwd();
  const vercelDir = path.join(projectRoot, '.vercel');
  const hasVercelJson = existsSync(path.join(projectRoot, 'vercel.json'));
  const hasVercelDir = existsSync(vercelDir);

  return hasVercelJson || hasVercelDir;
}

// Get Vercel project info
export function getVercelProjectInfo(): { configured: boolean; projectName?: string; orgId?: string } {
  try {
    const projectRoot = process.cwd();
    const vercelProjectPath = path.join(projectRoot, '.vercel', 'project.json');

    if (!existsSync(vercelProjectPath)) {
      return { configured: false };
    }

    const projectData = JSON.parse(readFileSync(vercelProjectPath, 'utf-8'));

    return {
      configured: true,
      projectName: projectData.projectId,
      orgId: projectData.orgId,
    };
  } catch {
    return { configured: false };
  }
}

// Deploy to Vercel and get deployment URL
export async function deployToVercel(): Promise<VercelDeployResult> {
  try {
    console.log('[VERCEL] Starting deployment...');
    console.log('[VERCEL] Timestamp:', new Date().toISOString());

    // Check if Vercel CLI is installed
    try {
      execSync('vercel --version', { stdio: 'ignore' });
      console.log('[VERCEL] ✓ Vercel CLI is installed');
    } catch {
      console.error('[VERCEL] ❌ Vercel CLI not found');

      return {
        success: false,
        error:
          'Vercel CLI is not installed. Install it with: npm install -g vercel\n\nThen run: vercel login && vercel link',
      };
    }

    // Check if project is linked to Vercel
    if (!isVercelConfigured()) {
      console.error('[VERCEL] ❌ Project not linked to Vercel');

      return {
        success: false,
        error:
          'Project is not linked to Vercel. Run the following commands:\n\n1. vercel login\n2. vercel link\n\nThen try again.',
      };
    }

    console.log('[VERCEL] ✓ Project is linked to Vercel');

    const projectInfo = getVercelProjectInfo();
    console.log('[VERCEL] Project:', projectInfo.projectName);

    // Deploy to Vercel (using --yes to skip prompts)
    console.log('[VERCEL] Deploying to Vercel...');
    console.log('[VERCEL] This may take 1-3 minutes...');

    const deployStartTime = Date.now();

    const output = execSync('vercel deploy --yes', {
      encoding: 'utf-8',
      cwd: process.cwd(),
      timeout: 300000, // 5 minutes max
      maxBuffer: 50 * 1024 * 1024,
    });

    const deployDuration = Date.now() - deployStartTime;

    console.log('[VERCEL] ✓ Deployment completed');
    console.log('[VERCEL] Duration:', Math.round(deployDuration / 1000), 'seconds');

    /*
     * Extract deployment URL from output
     * Vercel outputs the URL at the end of deployment
     * Look for the preview URL (last line typically)
     */
    const lines = output.split('\n');
    let deploymentUrl = '';

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();

      // Vercel URLs typically start with https:// and contain vercel.app
      if (line.startsWith('https://') && line.includes('.vercel.app')) {
        deploymentUrl = line;
        break;
      }

      // Also check for "Preview: https://..." format
      if (line.includes('https://') && line.includes('.vercel.app')) {
        const match = line.match(/https:\/\/[^\s]+\.vercel\.app[^\s]*/);

        if (match) {
          deploymentUrl = match[0];
          break;
        }
      }
    }

    if (!deploymentUrl) {
      console.error('[VERCEL] ❌ Could not extract deployment URL');
      console.log('[VERCEL] Deployment output:', output.slice(0, 500));

      return {
        success: false,
        error: 'Deployment succeeded but could not extract URL. Please check Vercel dashboard.',
        logs: output,
      };
    }

    console.log('[VERCEL] ✓ Deployment URL:', deploymentUrl);

    // Wait a moment for deployment to be ready
    console.log('[VERCEL] Waiting for deployment to be ready...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Verify deployment is accessible
    try {
      const response = await fetch(deploymentUrl, {
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        console.log('[VERCEL] ✓ Deployment is accessible');
      } else {
        console.log('[VERCEL] ⚠️  Deployment returned status:', response.status);
      }
    } catch {
      console.log('[VERCEL] ⚠️  Could not verify deployment (may still be building)');
    }

    return {
      success: true,
      url: deploymentUrl,
      logs: output,
    };
  } catch (error: any) {
    console.error('[VERCEL] ❌ Deployment failed');
    console.error('[VERCEL] Error:', error.message);

    let errorMessage = 'Failed to deploy to Vercel';

    if (error.message.includes('command not found') || error.message.includes('not recognized')) {
      errorMessage = 'Vercel CLI is not installed. Install with: npm install -g vercel';
    } else if (error.message.includes('not linked')) {
      errorMessage = 'Project not linked to Vercel. Run: vercel link';
    } else if (error.message.includes('timeout')) {
      errorMessage = 'Deployment timed out. Please try again or check Vercel dashboard.';
    } else {
      errorMessage = `Deployment failed: ${error.message}`;
    }

    return {
      success: false,
      error: errorMessage,
      logs: error.stdout || error.stderr || '',
    };
  }
}
