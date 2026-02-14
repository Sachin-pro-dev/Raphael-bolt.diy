/**
 * Memory Extractor - Extract memories from different sources
 *
 * This service analyzes artifacts, messages, and files to extract
 * meaningful memories that can be stored in Mem0.
 */

import type { Message } from 'ai';
import type { Memory, MemoryExtractionResult, MemoryMetadata } from '~/types/memory';

/**
 * Extract memories from various sources
 */
export class MemoryExtractor {
  /**
   * Extract memory from artifact creation
   */
  extractFromArtifact(artifact: any, chatId: string): Memory[] {
    const memories: Memory[] = [];

    // Extract project context from artifact
    if (artifact.title) {
      const content = `Working on: ${artifact.title}`;
      const metadata: MemoryMetadata = {
        artifactId: artifact.id,
        chatId,
        importance: 'high',
        confidence: 0.9,
      };

      memories.push({
        id: crypto.randomUUID(),
        content,
        type: 'project',
        metadata,
        timestamp: Date.now(),
        chatId,
      });
    }

    // Extract tech stack from artifact files
    const techStack = this.extractTechStackFromFiles(artifact.files || {});

    if (techStack.length > 0) {
      const content = `Tech stack: ${techStack.join(', ')}`;
      memories.push({
        id: crypto.randomUUID(),
        content,
        type: 'structure',
        metadata: {
          artifactId: artifact.id,
          chatId,
          techStack,
          importance: 'medium',
          confidence: 0.85,
        },
        timestamp: Date.now(),
        chatId,
      });
    }

    return memories;
  }

  /**
   * Extract memory from a chat message
   */
  extractFromMessage(message: Message, chatId: string): Memory[] {
    const memories: Memory[] = [];
    const content = message.content;

    // Skip short messages
    if (content.length < 50) {
      return memories;
    }

    // Detect technical decisions
    const decisionKeywords = [
      'decided to use',
      'chose',
      'going with',
      'instead of',
      'rather than',
      'prefer',
      'will use',
    ];

    for (const keyword of decisionKeywords) {
      if (content.toLowerCase().includes(keyword)) {
        memories.push({
          id: crypto.randomUUID(),
          content: content.substring(0, 500), // Truncate long messages
          type: 'decision',
          metadata: {
            messageId: message.id,
            chatId,
            importance: 'high',
            confidence: 0.8,
          },
          timestamp: Date.now(),
          chatId,
        });
        break;
      }
    }

    // Detect preferences
    const preferenceKeywords = ['i prefer', 'i like', 'i always', 'i usually', 'i want'];

    for (const keyword of preferenceKeywords) {
      if (content.toLowerCase().includes(keyword)) {
        memories.push({
          id: crypto.randomUUID(),
          content: content.substring(0, 500),
          type: 'preference',
          metadata: {
            messageId: message.id,
            chatId,
            importance: 'medium',
            confidence: 0.7,
          },
          timestamp: Date.now(),
          chatId,
        });
        break;
      }
    }

    // Detect important highlights (questions, requirements)
    const highlightKeywords = ['must', 'need to', 'require', 'important', 'critical', 'essential'];

    for (const keyword of highlightKeywords) {
      if (content.toLowerCase().includes(keyword) && message.role === 'user') {
        memories.push({
          id: crypto.randomUUID(),
          content: content.substring(0, 500),
          type: 'highlight',
          metadata: {
            messageId: message.id,
            chatId,
            importance: 'high',
            confidence: 0.75,
          },
          timestamp: Date.now(),
          chatId,
        });
        break;
      }
    }

    return memories;
  }

  /**
   * Extract memory from file structure
   */
  extractFromFiles(files: Record<string, any>, chatId: string): Memory[] {
    const memories: Memory[] = [];

    // Get tech stack
    const techStack = this.extractTechStackFromFiles(files);

    if (techStack.length > 0) {
      const content = `Project uses: ${techStack.join(', ')}`;
      memories.push({
        id: crypto.randomUUID(),
        content,
        type: 'structure',
        metadata: {
          chatId,
          techStack,
          fileCount: Object.keys(files).length,
          importance: 'medium',
          confidence: 0.9,
        },
        timestamp: Date.now(),
        chatId,
      });
    }

    // Analyze project structure
    const structure = this._analyzeProjectStructure(files);

    if (structure) {
      memories.push({
        id: crypto.randomUUID(),
        content: structure,
        type: 'structure',
        metadata: {
          chatId,
          fileCount: Object.keys(files).length,
          importance: 'low',
          confidence: 0.85,
        },
        timestamp: Date.now(),
        chatId,
      });
    }

    return memories;
  }

  /**
   * Extract tech stack from files based on file extensions and content
   */
  extractTechStackFromFiles(files: Record<string, any>): string[] {
    const techStack = new Set<string>();

    const fileExtensions = Object.keys(files).map((path) => {
      const parts = path.split('.');
      return parts.length > 1 ? parts[parts.length - 1] : '';
    });

    // Detect frameworks and libraries from file extensions
    if (fileExtensions.includes('tsx') || fileExtensions.includes('jsx')) {
      techStack.add('React');
    }

    if (fileExtensions.includes('ts')) {
      techStack.add('TypeScript');
    } else if (fileExtensions.includes('js')) {
      techStack.add('JavaScript');
    }

    if (fileExtensions.includes('vue')) {
      techStack.add('Vue');
    }

    if (fileExtensions.includes('svelte')) {
      techStack.add('Svelte');
    }

    if (fileExtensions.includes('py')) {
      techStack.add('Python');
    }

    if (fileExtensions.includes('java')) {
      techStack.add('Java');
    }

    if (fileExtensions.includes('go')) {
      techStack.add('Go');
    }

    if (fileExtensions.includes('rs')) {
      techStack.add('Rust');
    }

    // Check for configuration files
    if (files['package.json']) {
      try {
        const content = files['package.json'].content || '';

        if (content.includes('"next"')) {
          techStack.add('Next.js');
        }

        if (content.includes('"remix"')) {
          techStack.add('Remix');
        }

        if (content.includes('"vite"')) {
          techStack.add('Vite');
        }

        if (content.includes('"tailwind')) {
          techStack.add('Tailwind CSS');
        }

        if (content.includes('"zustand"')) {
          techStack.add('Zustand');
        }

        if (content.includes('"redux"')) {
          techStack.add('Redux');
        }
      } catch {
        // Ignore parse errors
      }
    }

    if (files['requirements.txt']) {
      techStack.add('Python');

      const content = files['requirements.txt'].content || '';

      if (content.includes('django')) {
        techStack.add('Django');
      }

      if (content.includes('flask')) {
        techStack.add('Flask');
      }

      if (content.includes('fastapi')) {
        techStack.add('FastAPI');
      }
    }

    if (files.Gemfile) {
      techStack.add('Ruby');

      const content = files.Gemfile.content || '';

      if (content.includes('rails')) {
        techStack.add('Rails');
      }
    }

    if (files['pom.xml'] || files['build.gradle']) {
      techStack.add('Java');
    }

    if (files['Cargo.toml']) {
      techStack.add('Rust');
    }

    if (files['go.mod']) {
      techStack.add('Go');
    }

    return Array.from(techStack);
  }

  /**
   * Analyze project structure to understand organization
   */
  private _analyzeProjectStructure(files: Record<string, any>): string | null {
    const paths = Object.keys(files);

    if (paths.length === 0) {
      return null;
    }

    // Detect common patterns
    const hasComponents = paths.some((p) => p.includes('components/'));
    const hasPages = paths.some((p) => p.includes('pages/'));
    const hasLib = paths.some((p) => p.includes('lib/'));
    const hasUtils = paths.some((p) => p.includes('utils/'));
    const hasServices = paths.some((p) => p.includes('services/'));
    const hasApi = paths.some((p) => p.includes('api/'));

    const patterns: string[] = [];

    if (hasComponents) {
      patterns.push('components');
    }

    if (hasPages) {
      patterns.push('pages');
    }

    if (hasLib) {
      patterns.push('lib');
    }

    if (hasUtils) {
      patterns.push('utils');
    }

    if (hasServices) {
      patterns.push('services');
    }

    if (hasApi) {
      patterns.push('API routes');
    }

    if (patterns.length > 0) {
      return `Project structure includes: ${patterns.join(', ')}`;
    }

    return null;
  }

  /**
   * Extract full context from a conversation
   */
  extractFromConversation(messages: Message[], chatId: string): MemoryExtractionResult {
    const memories: Memory[] = [];
    const techStack = new Set<string>();
    const preferences = new Set<string>();

    // Analyze each message
    for (const message of messages) {
      const extractedMemories = this.extractFromMessage(message, chatId);
      memories.push(...extractedMemories);

      // Extract tech stack mentions
      const content = message.content.toLowerCase();
      const techKeywords = [
        'react',
        'vue',
        'angular',
        'svelte',
        'typescript',
        'javascript',
        'python',
        'django',
        'flask',
        'node',
        'express',
        'next.js',
        'remix',
        'tailwind',
        'bootstrap',
      ];

      for (const tech of techKeywords) {
        if (content.includes(tech)) {
          techStack.add(tech.charAt(0).toUpperCase() + tech.slice(1));
        }
      }

      // Extract preferences
      if (message.role === 'user') {
        if (content.includes('functional component')) {
          preferences.add('Functional components');
        }

        if (content.includes('class component')) {
          preferences.add('Class components');
        }

        if (content.includes('arrow function')) {
          preferences.add('Arrow functions');
        }

        if (content.includes('async/await')) {
          preferences.add('Async/await');
        }

        if (content.includes('typescript')) {
          preferences.add('TypeScript');
        }
      }
    }

    // Generate summary
    const summary = this._generateConversationSummary(messages, Array.from(techStack));

    return {
      memories,
      summary,
      techStack: Array.from(techStack),
      preferences: Array.from(preferences),
    };
  }

  /**
   * Generate a summary of the conversation
   */
  private _generateConversationSummary(messages: Message[], techStack: string[]): string {
    if (messages.length === 0) {
      return 'No conversation history';
    }

    const userMessages = messages.filter((m) => m.role === 'user');
    const firstMessage = userMessages[0]?.content.substring(0, 200) || 'Unknown';

    let summary = `Conversation about: ${firstMessage}`;

    if (techStack.length > 0) {
      summary += ` | Technologies: ${techStack.join(', ')}`;
    }

    summary += ` | ${messages.length} messages`;

    return summary;
  }
}

// Singleton instance
let extractorInstance: MemoryExtractor | null = null;

/**
 * Get memory extractor instance
 */
export function getMemoryExtractor(): MemoryExtractor {
  if (!extractorInstance) {
    extractorInstance = new MemoryExtractor();
  }

  return extractorInstance;
}
