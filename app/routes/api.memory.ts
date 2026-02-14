/**
 * Memory API Routes (Server-Side Only - No IndexedDB fallback)
 *
 * Endpoints:
 * - POST /api/memory - Add a new memory
 * - GET /api/memory - Get all memories
 * - PUT /api/memory/:id - Update memory
 * - DELETE /api/memory/:id - Delete memory
 * - POST /api/memory/search - Search memories
 *
 * Note: This runs on the server, so IndexedDB is not available.
 * Only Mem0 API is used here. IndexedDB fallback happens client-side.
 */

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { MemoryClient } from 'mem0ai';
import type { SaveContextOptions } from '~/types/memory';

/**
 * Get Mem0 API key from request headers (sent from client)
 */
function getApiKeyFromRequest(request: Request): string | null {
  const apiKey = request.headers.get('x-mem0-api-key');
  return apiKey;
}

export async function action({ request }: ActionFunctionArgs) {
  const method = request.method;

  try {
    console.log(`[Memory API] ${method} request received`);

    // Get API key from headers (client should send this)
    const apiKey = getApiKeyFromRequest(request);

    if (!apiKey) {
      console.warn('[Memory API] No API key provided - client should handle with IndexedDB');
      return json(
        {
          success: false,
          error: 'No Mem0 API key provided. Please configure in settings or use client-side storage.',
          shouldUseClientStorage: true,
        },
        { status: 400 },
      );
    }

    console.log('[Memory API] Using Mem0 API with key:', '***' + apiKey.slice(-4));

    if (method === 'POST') {
      const body = (await request.json()) as SaveContextOptions;
      const { content, metadata = {}, type = 'project', importance = 'medium', chatId } = body;

      console.log('[Memory API] POST request:', {
        contentLength: content?.length,
        type,
        importance,
        chatId,
      });

      if (!content) {
        console.error('[Memory API] Missing content');
        return json({ success: false, error: 'Content is required' }, { status: 400 });
      }

      if (!chatId) {
        console.error('[Memory API] Missing chatId');
        return json({ success: false, error: 'Chat ID is required' }, { status: 400 });
      }

      // Create Mem0 client
      const mem0Client = new MemoryClient({ apiKey });

      // Add chatId to metadata
      const fullMetadata = {
        ...metadata,
        chatId,
        importance,
        type,
      };

      try {
        console.log('[Memory API] Adding memory to Mem0...');

        // Mem0 expects messages array (not a string)
        const messages = [
          {
            role: 'user',
            content,
          },
        ];

        const result = await mem0Client.add(messages, {
          user_id: chatId,
          metadata: fullMetadata,
        });

        console.log('[Memory API] Successfully saved to Mem0:', result);

        return json({
          success: true,
          memoryId: (result as any)?.id || crypto.randomUUID(),
          backend: 'mem0',
          result,
        });
      } catch (mem0Error: any) {
        console.error('[Memory API] Mem0 API error:', mem0Error);

        return json(
          {
            success: false,
            error: mem0Error?.message || 'Failed to save to Mem0 API',
            shouldUseClientStorage: true, // Signal client to use IndexedDB
            backend: 'mem0',
          },
          { status: 500 },
        );
      }
    }

    if (method === 'DELETE') {
      const url = new URL(request.url);
      const memoryId = url.searchParams.get('id');

      if (!memoryId) {
        console.error('[Memory API] Missing memory ID');
        return json({ success: false, error: 'Memory ID is required' }, { status: 400 });
      }

      // Create Mem0 client
      const mem0Client = new MemoryClient({ apiKey });

      try {
        console.log('[Memory API] Deleting memory:', memoryId);
        await mem0Client.delete(memoryId);
        console.log('[Memory API] Successfully deleted from Mem0');

        return json({
          success: true,
          memoryId,
          backend: 'mem0',
        });
      } catch (mem0Error: any) {
        console.error('[Memory API] Mem0 delete error:', mem0Error);

        return json(
          {
            success: false,
            error: mem0Error?.message || 'Failed to delete from Mem0 API',
            backend: 'mem0',
          },
          { status: 500 },
        );
      }
    }

    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    console.error('[Memory API] Unexpected error:', error);
    return json(
      {
        success: false,
        error: error?.message || 'Internal server error',
      },
      { status: 500 },
    );
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    console.log('[Memory API] GET request received');

    // Get API key from headers
    const apiKey = getApiKeyFromRequest(request);

    if (!apiKey) {
      console.warn('[Memory API] No API key provided for loader');
      return json(
        {
          success: false,
          error: 'No Mem0 API key provided',
          memories: [],
          shouldUseClientStorage: true,
        },
        { status: 400 },
      );
    }

    const url = new URL(request.url);
    const chatId = url.searchParams.get('chatId');
    const type = url.searchParams.get('type');
    const limit = url.searchParams.get('limit');

    console.log('[Memory API] GET params:', { chatId, type, limit });

    // Create Mem0 client
    const mem0Client = new MemoryClient({ apiKey });

    try {
      console.log('[Memory API] Fetching memories from Mem0...');

      // Get all memories for the user (chatId)
      const result = (await mem0Client.getAll({
        user_id: chatId || 'default',
      })) as any;

      const memories = ((result.results || result || []) as any[]).map((item: any) => ({
        id: item.id || crypto.randomUUID(),
        content: item.memory || item.text || '',
        type: item.metadata?.type || 'project',
        metadata: item.metadata || {},
        timestamp: new Date(item.created_at || Date.now()).getTime(),
        userId: chatId,
        chatId: item.metadata?.chatId,
      }));

      console.log(`[Memory API] Retrieved ${memories.length} memories`);

      // Apply filters
      let filtered = memories;

      if (type) {
        filtered = filtered.filter((m: any) => m.type === type);
      }

      if (limit) {
        filtered = filtered.slice(0, parseInt(limit));
      }

      return json({ success: true, memories: filtered });
    } catch (mem0Error: any) {
      console.error('[Memory API] Mem0 getAll error:', mem0Error);

      return json(
        {
          success: false,
          error: mem0Error?.message || 'Failed to fetch from Mem0 API',
          memories: [],
        },
        { status: 500 },
      );
    }
  } catch (error: any) {
    console.error('[Memory API] Unexpected error:', error);
    return json(
      {
        success: false,
        error: error?.message || 'Internal server error',
        memories: [],
      },
      { status: 500 },
    );
  }
}
