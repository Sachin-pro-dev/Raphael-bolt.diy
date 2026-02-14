import { json } from '@remix-run/cloudflare';
import { isVercelConfigured, getVercelProjectInfo } from '~/lib/.server/vercel-deploy';

export async function loader() {
  try {
    const configured = isVercelConfigured();
    const projectInfo = getVercelProjectInfo();

    return json({
      configured,
      projectName: projectInfo.projectName,
      needsSetup: !configured,
    });
  } catch (error: any) {
    return json({
      configured: false,
      needsSetup: true,
      error: error.message,
    });
  }
}
