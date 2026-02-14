import { generateText, type CoreTool, type GenerateTextResult, type Message } from 'ai';
import ignore from 'ignore';
import type { IProviderSetting } from '~/types/model';
import { IGNORE_PATTERNS, type FileMap } from './constants';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';
import { createFilesContext, extractCurrentContext, extractPropertiesFromMessage, simplifyBoltActions } from './utils';
import { createScopedLogger } from '~/utils/logger';
import { LLMManager } from '~/lib/modules/llm/manager';

// Common patterns to ignore, similar to .gitignore

const ig = ignore().add(IGNORE_PATTERNS);
const logger = createScopedLogger('select-context');

export async function selectContext(props: {
  messages: Message[];
  env?: Env;
  apiKeys?: Record<string, string>;
  files: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  summary: string;
  onFinish?: (resp: GenerateTextResult<Record<string, CoreTool<any, any>>, never>) => void;
}) {
  const { messages, env: serverEnv, apiKeys, files, providerSettings, summary, onFinish } = props;
  let currentModel = DEFAULT_MODEL;
  let currentProvider = DEFAULT_PROVIDER.name;
  const processedMessages = messages.map((message) => {
    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);
      currentModel = model;
      currentProvider = provider;

      return { ...message, content };
    } else if (message.role == 'assistant') {
      let content = message.content;

      content = simplifyBoltActions(content);

      content = content.replace(/<div class=\\"__boltThought__\\">.*?<\/div>/s, '');
      content = content.replace(/<think>.*?<\/think>/s, '');

      return { ...message, content };
    }

    return message;
  });

  const provider = PROVIDER_LIST.find((p) => p.name === currentProvider) || DEFAULT_PROVIDER;
  const staticModels = LLMManager.getInstance().getStaticModelListFromProvider(provider);
  let modelDetails = staticModels.find((m) => m.name === currentModel);

  if (!modelDetails) {
    const modelsList = [
      ...(provider.staticModels || []),
      ...(await LLMManager.getInstance().getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: serverEnv as any,
      })),
    ];

    if (!modelsList.length) {
      throw new Error(`No models found for provider ${provider.name}`);
    }

    modelDetails = modelsList.find((m) => m.name === currentModel);

    if (!modelDetails) {
      // Fallback to first model
      logger.warn(
        `MODEL [${currentModel}] not found in provider [${provider.name}]. Falling back to first model. ${modelsList[0].name}`,
      );
      modelDetails = modelsList[0];
    }
  }

  const { codeContext } = extractCurrentContext(processedMessages);

  // Get existing files
  let filePaths = getFilePaths(files || {});
  filePaths = filePaths.filter((x) => {
    const relPath = x.replace('/home/project/', '');
    return !ig.ignores(relPath);
  });

  // Extract prospective files from AI messages
  const prospectiveFiles = extractProspectiveFiles(processedMessages);

  // Debug: Log raw prospective files before normalization
  if (prospectiveFiles.length > 0) {
    logger.info(`Raw prospective files extracted: ${prospectiveFiles.length}`, prospectiveFiles);
  }

  // Normalize prospective file paths to full paths
  const prospectiveFullPaths = prospectiveFiles.map((path) => {
    // Ensure it starts with /home/project/
    if (path.startsWith('/home/project/')) {
      return path;
    }

    // Handle relative paths like "src/test-api.ts"
    return `/home/project/${path}`;
  });

  // Merge existing and prospective files
  filePaths = [...filePaths, ...prospectiveFullPaths];

  // Deduplicate
  filePaths = [...new Set(filePaths)];

  logger.info(`Total available files: ${filePaths.length} (including ${prospectiveFullPaths.length} prospective)`);

  if (prospectiveFullPaths.length > 0) {
    logger.debug(`Prospective files (normalized):`, prospectiveFullPaths);
  }

  // Debug: Check if test-api.ts is in the list
  const testApiPath = '/home/project/src/test-api.ts';

  if (filePaths.includes(testApiPath)) {
    logger.info(`✓ ${testApiPath} IS in available files`);
  } else {
    logger.warn(`✗ ${testApiPath} is NOT in available files`);

    // Show what IS in there
    const srcFiles = filePaths.filter((p) => p.includes('/src/'));

    logger.debug(`Files in /src/: ${srcFiles.length}`, srcFiles.slice(0, 5));
  }

  let context = '';
  const currrentFiles: string[] = [];
  const contextFiles: FileMap = {};

  if (codeContext?.type === 'codeContext') {
    const codeContextFiles: string[] = codeContext.files;
    Object.keys(files || {}).forEach((path) => {
      let relativePath = path;

      if (path.startsWith('/home/project/')) {
        relativePath = path.replace('/home/project/', '');
      }

      if (codeContextFiles.includes(relativePath)) {
        contextFiles[relativePath] = files[path];
        currrentFiles.push(relativePath);
      }
    });
    context = createFilesContext(contextFiles);
  }

  const summaryText = `Here is the summary of the chat till now: ${summary}`;

  const extractTextContent = (message: Message) =>
    Array.isArray(message.content)
      ? (message.content.find((item) => item.type === 'text')?.text as string) || ''
      : message.content;

  const lastUserMessage = processedMessages.filter((x) => x.role == 'user').pop();

  if (!lastUserMessage) {
    throw new Error('No user message found');
  }

  // select files from the list of code file from the project that might be useful for the current request from the user
  const resp = await generateText({
    system: `
        You are a software engineer. You are working on a project. You have access to the following files:

        AVAILABLE FILES PATHS
        ---
        ${filePaths.map((path) => `- ${path}`).join('\n')}
        ---

        You have following code loaded in the context buffer that you can refer to:

        CURRENT CONTEXT BUFFER
        ---
        ${context}
        ---

        Now, you are given a task. You need to select the files that are relevant to the task from the list of files above.

        RESPONSE FORMAT:
        your response should be in following format:
---
<updateContextBuffer>
    <includeFile path="path/to/file"/>
    <excludeFile path="path/to/file"/>
</updateContextBuffer>
---
        * Your should start with <updateContextBuffer> and end with </updateContextBuffer>.
        * You can include multiple <includeFile> and <excludeFile> tags in the response.
        * You should not include any other text in the response.
        * You should not include any file that is not in the list of files above.
        * You should not include any file that is already in the context buffer.
        * If no changes are needed, you can leave the response empty updateContextBuffer tag.
        `,
    prompt: `
        ${summaryText}

        Users Question: ${extractTextContent(lastUserMessage)}

        update the context buffer with the files that are relevant to the task from the list of files above.

        CRITICAL RULES:
        * Only include relevant files in the context buffer.
        * context buffer should not include any file that is not in the list of files above.
        * context buffer is extremlly expensive, so only include files that are absolutely necessary.
        * If no changes are needed, you can leave the response empty updateContextBuffer tag.
        * Only 5 files can be placed in the context buffer at a time.
        * if the buffer is full, you need to exclude files that is not needed and include files that is relevent.

        `,
    model: provider.getModelInstance({
      model: currentModel,
      serverEnv,
      apiKeys,
      providerSettings,
    }),
  });

  const response = resp.text;
  const updateContextBuffer = response.match(/<updateContextBuffer>([\s\S]*?)<\/updateContextBuffer>/);

  if (!updateContextBuffer) {
    throw new Error('Invalid response. Please follow the response format');
  }

  const includeFiles =
    updateContextBuffer[1]
      .match(/<includeFile path="(.*?)"/gm)
      ?.map((x) => x.replace('<includeFile path="', '').replace('"', '')) || [];
  const excludeFiles =
    updateContextBuffer[1]
      .match(/<excludeFile path="(.*?)"/gm)
      ?.map((x) => x.replace('<excludeFile path="', '').replace('"', '')) || [];

  const filteredFiles: FileMap = {};
  excludeFiles.forEach((path) => {
    delete contextFiles[path];
  });
  includeFiles.forEach((path) => {
    let fullPath = path;

    if (!path.startsWith('/home/project/')) {
      fullPath = `/home/project/${path}`;
    }

    // Check if file exists
    const fileExists = filePaths.includes(fullPath);

    if (!fileExists) {
      logger.info(`File ${path} doesn't exist yet (prospective file), skipping context inclusion`);

      // Skip files that don't exist - they'll be created by the AI in its response
      return;
    }

    if (currrentFiles.includes(path)) {
      return;
    }

    // Load file content (only for existing files now)
    const fileContent = files[fullPath];

    if (!fileContent) {
      logger.warn(`File ${path} exists in list but has no content`);
      return;
    }

    filteredFiles[path] = fileContent;
  });

  if (onFinish) {
    onFinish(resp);
  }

  const totalFiles = Object.keys(filteredFiles).length;
  logger.info(`Selected ${totalFiles} existing files for context`);

  // Allow 0 files - when creating new files, we might not need existing files in context
  if (totalFiles === 0) {
    logger.info('No existing files selected (likely creating new files with no dependencies)');
  }

  return filteredFiles;

  // generateText({
}

export function getFilePaths(files: FileMap) {
  let filePaths = Object.keys(files);
  filePaths = filePaths.filter((x) => {
    const relPath = x.replace('/home/project/', '');
    return !ig.ignores(relPath);
  });

  return filePaths;
}

/**
 * Extract file paths from <boltAction type="file"> and <includeFile> tags in messages
 * These are "prospective files" - files the AI intends to create or reference
 * Also extract file paths mentioned in user messages (e.g., "create src/foo.ts")
 */
function extractProspectiveFiles(messages: Message[]): string[] {
  const prospectiveFiles: string[] = [];
  const logger = createScopedLogger('extractProspective');

  logger.debug(`Processing ${messages.length} messages for prospective files`);

  for (const message of messages) {
    const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

    if (message.role === 'assistant') {
      // Match: <boltAction type="file" filePath="...">
      const fileActionRegex = /<boltAction\s+type="file"\s+filePath="([^"]+)"/g;
      let match;
      let actionCount = 0;

      while ((match = fileActionRegex.exec(content)) !== null) {
        const filePath = match[1];
        prospectiveFiles.push(filePath);
        actionCount++;
      }

      if (actionCount > 0) {
        logger.debug(`Found ${actionCount} <boltAction> file tags in assistant message`);
      }

      // Also match: <includeFile path="...">
      const includeFileRegex = /<includeFile\s+path="([^"]+)"/g;
      let includeCount = 0;

      while ((match = includeFileRegex.exec(content)) !== null) {
        const filePath = match[1];
        prospectiveFiles.push(filePath);
        includeCount++;
      }

      if (includeCount > 0) {
        logger.debug(`Found ${includeCount} <includeFile> tags in assistant message`);
      }
    } else if (message.role === 'user') {
      /*
       * Extract file paths from user messages
       * Match patterns like: "create src/test.ts", "add file foo/bar.tsx", etc.
       * Common file extensions for web projects
       */
      const filePathRegex =
        /(?:create|add|modify|update|edit|file|path)?\s+([a-zA-Z0-9_\-\/\.]+\.(?:ts|tsx|js|jsx|json|css|scss|html|md|yml|yaml|txt|py|java|go|rs|cpp|c|h))/gi;
      let match;
      let userFileCount = 0;

      while ((match = filePathRegex.exec(content)) !== null) {
        const filePath = match[1];
        prospectiveFiles.push(filePath);
        userFileCount++;
      }

      if (userFileCount > 0) {
        logger.debug(`Found ${userFileCount} potential file paths in user message`);
      }
    }
  }

  logger.debug(`Total prospective files extracted: ${prospectiveFiles.length}`);

  return prospectiveFiles;
}
