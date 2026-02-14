/**
 * Manifest file parsers for extracting dependency information
 * Supports multiple ecosystems: npm, Python, Go, Rust, Maven, etc.
 */

import type { PackageInfo, OsvEcosystem } from '~/types/osv';
import { MANIFEST_PATTERNS } from '~/types/osv';

/**
 * Detect manifest type from file path
 */
export function detectManifestType(filePath: string): OsvEcosystem | null {
  const fileName = filePath.toLowerCase();

  if (MANIFEST_PATTERNS.npm.test(fileName)) {
    return 'npm';
  }

  if (MANIFEST_PATTERNS.python.test(fileName)) {
    return 'PyPI';
  }

  if (MANIFEST_PATTERNS.go.test(fileName)) {
    return 'Go';
  }

  if (MANIFEST_PATTERNS.rust.test(fileName)) {
    return 'crates.io';
  }

  if (MANIFEST_PATTERNS.maven.test(fileName)) {
    return 'Maven';
  }

  if (MANIFEST_PATTERNS.nuget.test(fileName)) {
    return 'NuGet';
  }

  if (MANIFEST_PATTERNS.composer.test(fileName)) {
    return 'Packagist';
  }

  if (MANIFEST_PATTERNS.ruby.test(fileName)) {
    return 'RubyGems';
  }

  return null;
}

/**
 * Clean version string by removing prefixes like ^, ~, >=, etc.
 */
export function cleanVersion(version: string): string {
  if (!version) {
    return '';
  }

  // Remove common version prefixes and constraints
  let cleaned = version
    .trim()
    .replace(/^[\^~>=<]+/, '') // Remove ^, ~, >=, >, <, <=
    .replace(/\s*\|\|.*$/, '') // Remove OR conditions (||)
    .replace(/\s*-.*$/, '') // Remove range specifiers (1.0.0 - 2.0.0)
    .split(/\s+/)[0]; // Take first part if space-separated

  // Handle wildcards by taking the base version
  if (cleaned.includes('*') || cleaned.includes('x')) {
    cleaned = cleaned.replace(/[.*x].*$/, '0').replace(/\.$/, '.0');
  }

  return cleaned;
}

/**
 * Extract npm packages from package.json
 */
export function extractNpmPackages(content: string, manifestFile: string): PackageInfo[] {
  const packages: PackageInfo[] = [];

  try {
    const packageJson = JSON.parse(content);

    // Extract from dependencies
    if (packageJson.dependencies && typeof packageJson.dependencies === 'object') {
      for (const [name, version] of Object.entries(packageJson.dependencies)) {
        if (typeof version === 'string') {
          const cleanedVersion = cleanVersion(version);

          if (cleanedVersion) {
            packages.push({
              name,
              version: cleanedVersion,
              ecosystem: 'npm',
              manifestFile,
            });
          }
        }
      }
    }

    // Extract from devDependencies
    if (packageJson.devDependencies && typeof packageJson.devDependencies === 'object') {
      for (const [name, version] of Object.entries(packageJson.devDependencies)) {
        if (typeof version === 'string') {
          const cleanedVersion = cleanVersion(version);

          if (cleanedVersion) {
            packages.push({
              name,
              version: cleanedVersion,
              ecosystem: 'npm',
              manifestFile,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('[OSV] Failed to parse package.json:', error);
  }

  return packages;
}

/**
 * Extract Python packages from requirements.txt
 */
export function extractPythonPackages(content: string, manifestFile: string): PackageInfo[] {
  const packages: PackageInfo[] = [];

  // Split by lines and process each
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse package==version or package>=version format
    const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*([=><]+)\s*([0-9.]+)/);

    if (match) {
      const name = match[1];
      const version = cleanVersion(match[3]);

      if (version) {
        packages.push({
          name,
          version,
          ecosystem: 'PyPI',
          manifestFile,
        });
      }
    }
  }

  return packages;
}

/**
 * Extract Go packages from go.mod
 */
export function extractGoPackages(content: string, manifestFile: string): PackageInfo[] {
  const packages: PackageInfo[] = [];

  // Split by lines and process each
  const lines = content.split('\n');
  let inRequireBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect require block
    if (trimmed === 'require (') {
      inRequireBlock = true;
      continue;
    }

    if (trimmed === ')') {
      inRequireBlock = false;
      continue;
    }

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('//')) {
      continue;
    }

    /*
     * Parse require statement (both inline and block format)
     * Format: module/path v1.2.3 or require module/path v1.2.3
     */
    const match = trimmed.match(/^(?:require\s+)?([a-zA-Z0-9._/-]+)\s+v([0-9.]+)/);

    if (match && (inRequireBlock || trimmed.startsWith('require'))) {
      const name = match[1];
      const version = match[2];

      packages.push({
        name,
        version,
        ecosystem: 'Go',
        manifestFile,
      });
    }
  }

  return packages;
}

/**
 * Extract Rust packages from Cargo.toml
 */
export function extractRustPackages(content: string, manifestFile: string): PackageInfo[] {
  const packages: PackageInfo[] = [];

  try {
    // Simple TOML parser for [dependencies] section
    const lines = content.split('\n');
    let inDependencies = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect [dependencies] section
      if (trimmed === '[dependencies]' || trimmed === '[dev-dependencies]') {
        inDependencies = true;
        continue;
      }

      // Exit dependencies section when we hit another section
      if (trimmed.startsWith('[') && inDependencies) {
        inDependencies = false;
        continue;
      }

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#') || !inDependencies) {
        continue;
      }

      /*
       * Parse dependency line
       * Format: package = "1.2.3" or package = { version = "1.2.3" }
       */
      let match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*"([0-9.]+)"/);

      if (!match) {
        match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*\{.*version\s*=\s*"([0-9.]+)"/);
      }

      if (match) {
        const name = match[1];
        const version = cleanVersion(match[2]);

        if (version) {
          packages.push({
            name,
            version,
            ecosystem: 'crates.io',
            manifestFile,
          });
        }
      }
    }
  } catch (error) {
    console.error('[OSV] Failed to parse Cargo.toml:', error);
  }

  return packages;
}

/**
 * Extract Maven packages from pom.xml (basic support)
 */
export function extractMavenPackages(content: string, manifestFile: string): PackageInfo[] {
  const packages: PackageInfo[] = [];

  try {
    // Basic regex-based XML parsing for <dependency> blocks
    const dependencyRegex =
      /<dependency>[\s\S]*?<groupId>(.*?)<\/groupId>[\s\S]*?<artifactId>(.*?)<\/artifactId>[\s\S]*?<version>(.*?)<\/version>[\s\S]*?<\/dependency>/g;

    let match;

    while ((match = dependencyRegex.exec(content)) !== null) {
      const groupId = match[1].trim();
      const artifactId = match[2].trim();
      const version = cleanVersion(match[3].trim());

      if (version) {
        packages.push({
          name: `${groupId}:${artifactId}`,
          version,
          ecosystem: 'Maven',
          manifestFile,
        });
      }
    }
  } catch (error) {
    console.error('[OSV] Failed to parse pom.xml:', error);
  }

  return packages;
}

/**
 * Extract packages from manifest file based on type
 */
export function extractPackagesFromManifest(
  filePath: string,
  content: string,
): { packages: PackageInfo[]; ecosystem: OsvEcosystem | null } {
  const ecosystem = detectManifestType(filePath);

  if (!ecosystem) {
    return { packages: [], ecosystem: null };
  }

  let packages: PackageInfo[] = [];

  switch (ecosystem) {
    case 'npm':
      packages = extractNpmPackages(content, filePath);
      break;
    case 'PyPI':
      packages = extractPythonPackages(content, filePath);
      break;
    case 'Go':
      packages = extractGoPackages(content, filePath);
      break;
    case 'crates.io':
      packages = extractRustPackages(content, filePath);
      break;
    case 'Maven':
      packages = extractMavenPackages(content, filePath);
      break;
    default:
      console.log(`[OSV] Unsupported ecosystem: ${ecosystem}`);
  }

  return { packages, ecosystem };
}

/**
 * Extract all packages from multiple manifest files
 */
export function extractAllPackages(files: Array<{ path: string; content: string }>): PackageInfo[] {
  const allPackages: PackageInfo[] = [];

  for (const file of files) {
    const { packages } = extractPackagesFromManifest(file.path, file.content);
    allPackages.push(...packages);
  }

  return allPackages;
}
