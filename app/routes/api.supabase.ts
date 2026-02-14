import { json, type ActionFunction } from '@remix-run/cloudflare';
import type { SupabaseProject } from '~/types/supabase';

/**
 * Fetch with timeout and retry logic
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeout = 10000, retries = 2): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      return response;
    } catch (error) {
      if (i === retries) {
        clearTimeout(timeoutId);
        throw error;
      }

      // Wait before retry (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }

  throw new Error('Max retries reached');
}

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { token } = body as { token?: string };

    // Validate token
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      console.error('Invalid or missing token');
      return json({ error: 'Invalid or missing authentication token' }, { status: 400 });
    }

    console.log('[Supabase API] Fetching projects...');

    let projectsResponse: Response;

    try {
      projectsResponse = await fetchWithTimeout(
        'https://api.supabase.com/v1/projects',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0',
          },
        },
        15000, // 15 second timeout
        2, // 2 retries
      );
    } catch (fetchError: any) {
      console.error('[Supabase API] Fetch error:', {
        message: fetchError?.message,
        cause: fetchError?.cause,
        type: fetchError?.type,
      });

      // Handle specific fetch errors
      if (fetchError?.name === 'AbortError') {
        return json({ error: 'Request timeout - Supabase API took too long to respond' }, { status: 504 });
      }

      if (fetchError?.message?.includes('ENOTFOUND') || fetchError?.message?.includes('DNS')) {
        return json(
          { error: 'Network error - Unable to reach Supabase API. Please check your internet connection.' },
          { status: 503 },
        );
      }

      if (fetchError?.message?.includes('certificate') || fetchError?.message?.includes('SSL')) {
        return json(
          { error: 'SSL/TLS error - Certificate validation failed. This may be a network security issue.' },
          { status: 503 },
        );
      }

      // Generic fetch failure
      return json(
        {
          error: 'Failed to connect to Supabase API. Please check your network connection and try again.',
          details: fetchError?.message || 'Unknown network error',
        },
        { status: 503 },
      );
    }

    // Handle non-OK responses
    if (!projectsResponse.ok) {
      const errorText = await projectsResponse.text().catch(() => 'Unable to read error response');
      console.error('[Supabase API] HTTP error:', {
        status: projectsResponse.status,
        statusText: projectsResponse.statusText,
        error: errorText,
      });

      if (projectsResponse.status === 401 || projectsResponse.status === 403) {
        return json(
          { error: 'Invalid authentication token. Please check your Supabase access token.' },
          { status: 401 },
        );
      }

      if (projectsResponse.status === 429) {
        return json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });
      }

      return json(
        {
          error: `Supabase API error (${projectsResponse.status})`,
          details: errorText,
        },
        { status: projectsResponse.status },
      );
    }

    // Parse projects
    let projects: SupabaseProject[];

    try {
      projects = (await projectsResponse.json()) as SupabaseProject[];
    } catch (parseError) {
      console.error('[Supabase API] JSON parse error:', parseError);
      return json({ error: 'Invalid response from Supabase API' }, { status: 502 });
    }

    // Validate projects array
    if (!Array.isArray(projects)) {
      console.error('[Supabase API] Invalid projects data - not an array');
      return json({ error: 'Invalid response format from Supabase API' }, { status: 502 });
    }

    // Deduplicate projects
    const uniqueProjectsMap = new Map<string, SupabaseProject>();

    for (const project of projects) {
      if (project?.id && !uniqueProjectsMap.has(project.id)) {
        uniqueProjectsMap.set(project.id, project);
      }
    }

    const uniqueProjects = Array.from(uniqueProjectsMap.values());

    // Sort by creation date
    uniqueProjects.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();

      return dateB - dateA;
    });

    console.log(`[Supabase API] Successfully fetched ${uniqueProjects.length} projects`);

    return json({
      user: { email: 'Connected', role: 'Admin' },
      stats: {
        projects: uniqueProjects,
        totalProjects: uniqueProjects.length,
      },
    });
  } catch (error: any) {
    console.error('[Supabase API] Unexpected error:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });

    return json(
      {
        error: 'An unexpected error occurred',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
};
