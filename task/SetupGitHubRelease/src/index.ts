import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as tl from 'azure-pipelines-task-lib/task';

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type ReleaseInfo = {
  tag_name: string;
  assets: ReleaseAsset[];
};

type PlatformInfo = {
  system: string;
  arch: string;
  systemPattern: string;
  archPattern: string;
};

type MatchOptions = {
  fileName?: string;
  fileType?: string;
};

const systemPatterns: Record<string, string> = {
  linux: 'linux',
  darwin: '(darwin|macos|mac|osx)',
  win32: '(windows|win)'
};

const archPatterns: Record<string, string> = {
  x64: '(x86_64|x64|amd64)',
  arm64: '(aarch64|arm64)'
};

function getPlatformInfo(): PlatformInfo {
  const system = os.platform();
  const arch = os.arch();

  return {
    system,
    arch,
    systemPattern: systemPatterns[system] || system,
    archPattern: archPatterns[arch] || arch
  };
}

function getExtensionPattern(fileType: string): string {
  if (fileType === 'archive') {
    return '\\.(zip|tar\\.gz|tar|tgz|7z)';
  }

  if (fileType === 'package') {
    return '\\.(deb|rpm|pkg)';
  }

  return fileType;
}

function getMatchingAsset(assets: ReleaseAsset[], platform: PlatformInfo, options: MatchOptions): ReleaseAsset {
  const fileName = options.fileName;
  const extPattern = getExtensionPattern(options.fileType || 'archive');

  if (!fileName) {
    const pattern = `${platform.systemPattern}[_-]${platform.archPattern}.*${extPattern}$`;
    const regex = new RegExp(pattern, 'i');
    const matches = assets.filter((asset) => regex.test(asset.name));
    if (matches.length === 0) {
      throw new Error(`No assets matched the default criteria: ${pattern}`);
    }

    if (matches.length > 1) {
      throw new Error(`Multiple assets matched the default criteria: ${matches.map((asset) => asset.name).join(', ')}`);
    }

    return matches[0];
  }

  if (fileName.startsWith('~')) {
    let pattern = fileName.substring(1);
    const hasSystem = pattern.includes('{{SYSTEM}}');
    const hasArch = pattern.includes('{{ARCH}}');
    const hasExt = pattern.includes('{{EXT_PATTERN}}');
    const hasEnd = pattern.endsWith('$');

    if (!hasSystem && !hasArch && !hasExt && !hasEnd) {
      pattern += '.*{{SYSTEM}}[_-]{{ARCH}}.*{{EXT_PATTERN}}$';
    } else if (hasSystem && hasArch && !hasExt && !hasEnd) {
      pattern += '.*{{EXT_PATTERN}}$';
    }

    const finalPattern = pattern
      .replace(/{{SYSTEM}}/g, platform.systemPattern)
      .replace(/{{ARCH}}/g, platform.archPattern)
      .replace(/{{EXT_PATTERN}}/g, extPattern);

    const regex = new RegExp(finalPattern, 'i');
    const matches = assets.filter((asset) => regex.test(asset.name));
    if (matches.length === 0) {
      throw new Error(`No assets matched the regex: ${finalPattern}`);
    }

    if (matches.length > 1) {
      throw new Error(`Multiple assets matched the criteria: ${matches.map((asset) => asset.name).join(', ')}`);
    }

    return matches[0];
  }

  const exact = assets.find((asset) => asset.name === fileName);
  if (!exact) {
    throw new Error(`No asset found matching the exact name: ${fileName}`);
  }

  return exact;
}

async function fetchLatestRelease(repository: string, token?: string): Promise<ReleaseInfo> {
  const url = `https://api.github.com/repos/${repository}/releases/latest`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'setup-github-release-ado-task'
  };

  if (token) {
    headers.Authorization = `token ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to fetch latest release for ${repository}: ${response.status} ${response.statusText}. ${body}`);
  }

  return (await response.json()) as ReleaseInfo;
}

async function downloadAsset(url: string, destinationPath: string, token?: string): Promise<void> {
  const headers: Record<string, string> = {
    'User-Agent': 'setup-github-release-ado-task'
  };

  if (token) {
    headers.Authorization = `token ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to download asset from ${url}: ${response.status} ${response.statusText}. ${body}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await fsp.writeFile(destinationPath, Buffer.from(arrayBuffer));
}

async function extractAsset(filePath: string, destinationDirectory: string): Promise<void> {
  const lowerName = path.basename(filePath).toLowerCase();

  await fsp.mkdir(destinationDirectory, { recursive: true });

  if (lowerName.endsWith('.tar.gz') || lowerName.endsWith('.tgz') || lowerName.endsWith('.tar')) {
    const result = spawnSync('tar', ['-xf', filePath, '-C', destinationDirectory]);
    if (result.status !== 0) {
      throw new Error(`tar failed with status ${result.status}: ${result.stderr.toString()}`);
    }
    return;
  }

  if (lowerName.endsWith('.zip')) {
    if (process.platform === 'win32') {
      const tarResult = spawnSync('tar', ['-xf', filePath, '-C', destinationDirectory]);
      if (tarResult.status === 0) {
        return;
      }

      const escapedFilePath = filePath.replace(/'/g, "''");
      const escapedDestinationDirectory = destinationDirectory.replace(/'/g, "''");
      const command = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${escapedFilePath}', '${escapedDestinationDirectory}')`;

      for (const shell of ['pwsh', 'powershell']) {
        const result = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command]);
        if (result.status === 0) {
          return;
        }
      }

      throw new Error('ZIP extraction failed on Windows.');
    }

    const unzipResult = spawnSync('unzip', ['-q', filePath, '-d', destinationDirectory]);
    if (unzipResult.status !== 0) {
      throw new Error(`unzip failed with status ${unzipResult.status}: ${unzipResult.stderr.toString()}`);
    }
    return;
  }

  if (lowerName.endsWith('.7z')) {
    const sevenZipResult = spawnSync('7z', ['x', filePath, `-o${destinationDirectory}`, '-y']);
    if (sevenZipResult.status !== 0) {
      throw new Error(`7z failed with status ${sevenZipResult.status}: ${sevenZipResult.stderr.toString()}`);
    }
    return;
  }

  if (lowerName.endsWith('.pkg') || lowerName.endsWith('.xar')) {
    const xarResult = spawnSync('xar', ['-xf', filePath], { cwd: destinationDirectory });
    if (xarResult.status !== 0) {
      throw new Error(`xar failed with status ${xarResult.status}: ${xarResult.stderr.toString()}`);
    }
    return;
  }

  const destinationPath = path.join(destinationDirectory, path.basename(filePath));
  await fsp.copyFile(filePath, destinationPath);
}

function findBinary(directory: string, pattern: string | RegExp, debug: boolean): string | undefined {
  const items = fs.readdirSync(directory);

  if (debug) {
    tl.debug(`Searching for binary in ${directory}`);
    for (const item of items) {
      tl.debug(`- ${item}`);
    }
  }

  for (const item of items) {
    const fullPath = path.join(directory, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const nested = findBinary(fullPath, pattern, debug);
      if (nested) {
        return nested;
      }
      continue;
    }

    let match = false;
    if (pattern instanceof RegExp) {
      match = pattern.test(item);
    } else {
      match = item === pattern;
      if (!match && process.platform === 'win32' && !pattern.toLowerCase().endsWith('.exe')) {
        match = item.toLowerCase() === `${pattern.toLowerCase()}.exe`;
      }
    }

    if (match) {
      return fullPath;
    }
  }

  return undefined;
}

async function copyDirectory(sourceDirectory: string, destinationDirectory: string): Promise<void> {
  await fsp.mkdir(destinationDirectory, { recursive: true });
  const entries = await fsp.readdir(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDirectory, entry.name);
    const destinationPath = path.join(destinationDirectory, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
    } else if (entry.isSymbolicLink()) {
      const linkTarget = await fsp.readlink(sourcePath);
      await fsp.symlink(linkTarget, destinationPath);
    } else {
      await fsp.copyFile(sourcePath, destinationPath);
    }
  }
}

function getToolsRoot(): string {
  const toolsDirectory = tl.getVariable('Agent.ToolsDirectory');
  if (toolsDirectory !== undefined) {
    return toolsDirectory;
  }

  return path.join(os.homedir(), '.ado-sk-tools');
}

async function findAnyCachedVersion(toolName: string, arch: string): Promise<{ version: string; toolDirectory: string } | undefined> {
  const archRoot = path.join(getToolsRoot(), toolName);
  if (!fs.existsSync(archRoot)) {
    return undefined;
  }

  const entries = await fsp.readdir(archRoot, { withFileTypes: true });
  const versions = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (let index = versions.length - 1; index >= 0; index -= 1) {
    const version = versions[index];
    const candidate = path.join(archRoot, version, arch);
    if (fs.existsSync(candidate)) {
      return {
        version,
        toolDirectory: candidate
      };
    }
  }

  return undefined;
}

function getSpecificCacheDirectory(toolName: string, version: string, arch: string): string {
  return path.join(getToolsRoot(), toolName, version, arch);
}

async function cacheTool(sourceDirectory: string, toolName: string, version: string, arch: string): Promise<string> {
  const destinationDirectory = getSpecificCacheDirectory(toolName, version, arch);
  await fsp.rm(destinationDirectory, { recursive: true, force: true });
  await copyDirectory(sourceDirectory, destinationDirectory);
  return destinationDirectory;
}

function setExecutable(filePath: string): void {
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755);
  }
}

async function run(): Promise<void> {
  try {
    const repository = tl.getInputRequired('repository');
    const fileNameInput = tl.getInput('fileName', false) || '';
    const binaryInput = tl.getInput('binaryName', false) || '';
    const fileType = tl.getInput('fileType', false) || 'archive';
    const updateCache = (tl.getInput('updateCache', false) || 'false').toLowerCase();
    const debug = tl.getBoolInput('debug', false);
    const token = tl.getInput('token', false) || process.env.GITHUB_TOKEN;

    if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
      throw new Error('Input repository must be in owner/repo format.');
    }

    if (!['false', 'true', 'always'].includes(updateCache)) {
      throw new Error('Input updateCache must be one of: false, true, always.');
    }

    const platformInfo = getPlatformInfo();
    const toolName = repository.split('/').pop() || repository;

    if (updateCache === 'false') {
      const cached = await findAnyCachedVersion(toolName, platformInfo.arch);
      if (cached) {
        tl.debug(`Using cached ${toolName} version ${cached.version}`);
        tl.prependPath(cached.toolDirectory);
        tl.setResult(tl.TaskResult.Succeeded, `Using cached ${toolName} version ${cached.version}.`);
        return;
      }
    }

    tl.debug(`Fetching latest release for ${repository}`);
    const release = await fetchLatestRelease(repository, token);
    const asset = getMatchingAsset(release.assets, platformInfo, {
      fileName: fileNameInput,
      fileType
    });

    const version = release.tag_name.replace(/^v/, '');
    const binaryName = binaryInput || toolName;

    if (updateCache !== 'always') {
      const cachedDirectory = getSpecificCacheDirectory(toolName, version, platformInfo.arch);
      if (fs.existsSync(cachedDirectory)) {
        tl.debug(`Using cached ${toolName} version ${version}`);
        tl.prependPath(cachedDirectory);
        tl.setResult(tl.TaskResult.Succeeded, `Using cached ${toolName} version ${version}.`);
        return;
      }
    }

    const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'setup-github-release-'));
    const downloadPath = path.join(tempRoot, asset.name);

    tl.debug(`Downloading asset ${asset.name}`);
    await downloadAsset(asset.browser_download_url, downloadPath, token);

    let extractionRoot = path.join(tempRoot, 'extract');
    const lowerName = asset.name.toLowerCase();

    if (
      /\.(tar\.gz|tar|tgz)$/i.test(lowerName) ||
      /\.zip$/i.test(lowerName) ||
      /\.7z$/i.test(lowerName) ||
      /\.(xar|pkg)$/i.test(lowerName)
    ) {
      await extractAsset(downloadPath, extractionRoot);
    } else {
      extractionRoot = path.join(tempRoot, 'bin');
      await fsp.mkdir(extractionRoot, { recursive: true });
      const destinationPath = path.join(extractionRoot, asset.name);
      await fsp.rename(downloadPath, destinationPath);
      setExecutable(destinationPath);
    }

    const binaryPattern = binaryName.startsWith('~')
      ? new RegExp(binaryName.substring(1), 'i')
      : binaryName;

    const binaryPath = findBinary(extractionRoot, binaryPattern, debug);
    if (!binaryPath) {
      throw new Error(`Could not find binary ${binaryName} in extracted asset.`);
    }

    setExecutable(binaryPath);

    const binaryDirectory = path.dirname(binaryPath);
    const cachedDirectory = await cacheTool(binaryDirectory, toolName, version, platformInfo.arch);

    tl.prependPath(cachedDirectory);
    tl.setResult(tl.TaskResult.Succeeded, `Installed ${toolName} ${version} from ${repository}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tl.setResult(tl.TaskResult.Failed, message);
  }
}

void run();
