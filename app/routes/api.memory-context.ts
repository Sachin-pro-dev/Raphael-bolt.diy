/**
 * Memory Context API Route
 *
 * Endpoint: POST /api/memory-context
 *
 * Retrieves relevant context for the current chat session
 * to be injected into the AI prompt
 */

import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { MemoryClient } from 'mem0ai';
import type { ContextOptions, Memory } from '~/types/memory';

export async function action({ request }: ActionFunctionArgs) {
  try {
    console.log('[Memory Context API] POST request received');

    const body = (await request.json()) as ContextOptions;
    const { chatId, messages = [], limit = 10 } = body;

    if (!chatId) {
      console.error('[Memory Context API] Missing chatId');
      return json({ success: false, error: 'Chat ID is required' }, { status: 400 });
    }

    // Get API key from headers
    const apiKey = request.headers.get('x-mem0-api-key');

    if (!apiKey) {
      console.warn('[Memory Context API] No API key - returning empty context');
      return json({
        success: true,
        context: {
          memories: [],
          summary: 'No memory configured',
          formattedForPrompt: '',
          confidence: 0,
        },
        message: 'Mem0 is not configured',
      });
    }

    console.log('[Memory Context API] Fetching memories for chatId:', chatId);

    // Create Mem0 client
    const mem0Client = new MemoryClient({ apiKey });

    try {
      // Search for relevant memories
      const recentQuery = messages
        .slice(-3)
        .map((m) => m.content)
        .join(' ')
        .substring(0, 500);

      console.log('[Memory Context API] Searching with query length:', recentQuery.length);

      let memories: Memory[] = [];

      // Get all memories for this user
      const allMemoriesResult = (await mem0Client.getAll({
        user_id: chatId,
      })) as any;

      console.log('[Memory Context API] Raw Mem0 response:', allMemoriesResult);

      const rawMemories = (allMemoriesResult.results || allMemoriesResult || []) as any[];

      console.log('[Memory Context API] Found', rawMemories.length, 'total memories');

      // Transform Mem0 format to our Memory format
      memories = rawMemories.map((item: any) => ({
        id: item.id || item.memory_id || crypto.randomUUID(),
        content: item.memory || item.text || '',
        type: item.metadata?.type || 'project',
        metadata: item.metadata || {},
        timestamp: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
        userId: chatId,
        chatId: item.metadata?.chatId || chatId,
      }));

      // Sort by timestamp (most recent first)
      memories.sort((a, b) => b.timestamp - a.timestamp);

      // Limit results
      const limitedMemories = memories.slice(0, limit);

      console.log('[Memory Context API] Returning', limitedMemories.length, 'memories');

      // Format for prompt
      const formattedForPrompt = formatMemoriesForPrompt(limitedMemories);

      // Generate summary
      const summary = generateSummary(limitedMemories);

      return json({
        success: true,
        context: {
          memories: limitedMemories,
          summary,
          formattedForPrompt,
          confidence: limitedMemories.length > 0 ? 0.8 : 0,
        },
      });
    } catch (mem0Error: any) {
      console.error('[Memory Context API] Mem0 error:', mem0Error);

      return json({
        success: true,
        context: {
          memories: [],
          summary: 'Error loading memories',
          formattedForPrompt: '',
          confidence: 0,
        },
        error: mem0Error?.message,
      });
    }
  } catch (error: any) {
    console.error('[Memory Context API] Unexpected error:', error);
    return json(
      {
        success: false,
        error: error?.message || 'Internal server error',
        context: {
          memories: [],
          summary: '',
          formattedForPrompt: '',
          confidence: 0,
        },
      },
      { status: 500 },
    );
  }
}

/**
 * Format memories for insertion into prompt
 */
function formatMemoriesForPrompt(memories: Memory[]): string {
  if (memories.length === 0) {
    return '';
  }

  const sections: string[] = [];

  sections.push('[CONTEXT FROM PREVIOUS WORK]');
  sections.push('');

  // Group by type
  const byType = memories.reduce(
    (acc, m) => {
      if (!acc[m.type]) {
        acc[m.type] = [];
      }

      acc[m.type].push(m);

      return acc;
    },
    {} as Record<string, Memory[]>,
  );

  if (byType.project) {
    sections.push('Project Context:');
    byType.project.forEach((m) => sections.push(`- ${m.content}`));
    sections.push('');
  }

  if (byType.preference) {
    sections.push('User Preferences:');
    byType.preference.forEach((m) => sections.push(`- ${m.content}`));
    sections.push('');
  }

  if (byType.decision) {
    sections.push('Previous Decisions:');
    byType.decision.forEach((m) => sections.push(`- ${m.content}`));
    sections.push('');
  }

  if (byType.highlight) {
    sections.push('Important Notes:');
    byType.highlight.forEach((m) => sections.push(`- ${m.content}`));
    sections.push('');
  }

  if (byType.structure) {
    sections.push('Project Structure:');
    byType.structure.forEach((m) => sections.push(`- ${m.content}`));
    sections.push('');
  }

  sections.push('[END CONTEXT]');
  sections.push('');

  return sections.join('\n');
}

/**
 * Generate a summary from memories
 */
function generateSummary(memories: Memory[]): string {
  if (memories.length === 0) {
    return 'No previous context available.';
  }

  const projectMemories = memories.filter((m) => m.type === 'project');
  const preferenceMemories = memories.filter((m) => m.type === 'preference');
  const decisionMemories = memories.filter((m) => m.type === 'decision');
  const highlightMemories = memories.filter((m) => m.type === 'highlight');

  const parts: string[] = [];

  if (projectMemories.length > 0) {
    parts.push(`${projectMemories.length} project context(s)`);
  }

  if (preferenceMemories.length > 0) {
    parts.push(`${preferenceMemories.length} preference(s)`);
  }

  if (decisionMemories.length > 0) {
    parts.push(`${decisionMemories.length} decision(s)`);
  }

  if (highlightMemories.length > 0) {
    parts.push(`${highlightMemories.length} highlight(s)`);
  }

  return `Loaded: ${parts.join(', ')}`;
}
