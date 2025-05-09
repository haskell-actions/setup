import * as core from '@actions/core';
import {exec as e} from '@actions/exec';
import {which} from '@actions/io';
import * as tc from '@actions/tool-cache';
import {promises as afs} from 'fs';
import {join, dirname} from 'path';
import {ghcup_version, Arch, OS, Tool, releaseRevision} from './opts';
import process from 'process';
import * as glob from '@actions/glob';
import * as fs from 'fs';
import {compareVersions, validate} from 'compare-versions'; // compareVersions can be used in the sense of >

// Don't throw on non-zero.
const exec = async (cmd: string, args?: string[]): Promise<number> =>
  e(cmd, args, {ignoreReturnCode: true});

function failed(tool: Tool, version: string): void {
  throw new Error(`All install methods for ${tool} ${version} failed`);
}

async function configureOutputs(
  tool: Tool,
  version: string,
  path: string,
  os: OS
): Promise<void> {
  core.setOutput(`${tool}-path`, path);
  core.setOutput(`${tool}-exe`, await which(tool));
  if (tool == 'stack') {
    const sr =
      process.env['STACK_ROOT'] ??
      (os === 'win32' ? 'C:\\sr' : `${process.env.HOME}/.stack`);
    core.setOutput('stack-root', sr);
    if (os === 'win32') core.exportVariable('STACK_ROOT', sr);
  }
  core.setOutput(`${tool}-version`, version);
}

async function success(
  tool: Tool,
  version: string,
  path: string,
  os: OS
): Promise<true> {
  core.addPath(path);
  await configureOutputs(tool, version, path, os);
  core.info(
    `Found ${tool} ${version} in cache at path ${path}. Setup successful.`
  );
  return true;
}

function warn(tool: Tool, version: string): void {
  core.debug(
    `${tool} ${version} was not found in the cache. It will be downloaded.\n` +
      `If this is unexpected, please check if version ${version} is pre-installed.\n` +
      `The list of pre-installed versions is available from here: https://github.com/actions/runner-images#available-images\n` +
      'If the list is outdated, please file an issue here: https://github.com/actions/runner-images/issues\n' +
      'by using the appropriate tool request template: https://github.com/actions/runner-images/issues/new/choose'
  );
}

async function isInstalled(
  tool: Tool,
  version: string,
  os: OS,
  arch: Arch
): Promise<boolean> {
  const toolPath = tc.find(tool, version);
  if (toolPath) return success(tool, version, toolPath, os);

  // Path where ghcup installs binaries
  const ghcupPath =
    os === 'win32' ? 'C:/ghcup/bin' : `${process.env.HOME}/.ghcup/bin`;

  // Path where choco installs binaries of a tool
  const chocoPath = await getChocoPath(
    tool,
    version,
    releaseRevision(version, tool, os)
  );

  const locations = {
    stack: [], // Always installed into the tool cache
    cabal: {
      win32: [chocoPath, ghcupPath],
      linux: [ghcupPath],
      darwin: [ghcupPath]
    }[os],
    ghc: {
      win32: [chocoPath, ghcupPath],
      linux: [ghcupPath],
      darwin: [ghcupPath]
    }[os]
  };
  core.debug(`isInstalled ${tool} ${version} ${locations[tool]}`);
  const f = await exec(await ghcupBin(os, arch), ['whereis', tool, version]);
  core.info(`\n`);
  core.debug(`isInstalled whereis ${f}`);

  for (const p of locations[tool]) {
    core.info(`Attempting to access tool ${tool} at location ${p}`);
    const installedPath = await afs
      .access(p)
      .then(() => p)
      .catch(() => undefined);

    if (installedPath == undefined) {
      core.info(`Failed to access tool ${tool} at location ${p}`);
    } else {
      core.info(`Succeeded accessing tool ${tool} at location ${p}`);
    }

    if (installedPath) {
      // Make sure that the correct ghc is used, even if ghcup has set a
      // default prior to this action being ran.
      core.debug(`isInstalled installedPath: ${installedPath}`);
      if (installedPath === ghcupPath) {
        // If the result of this `ghcup set` is non-zero, the version we want
        // is probably not actually installed
        const ghcupSetResult = await exec(await ghcupBin(os, arch), [
          'set',
          tool,
          version
        ]);
        if (ghcupSetResult == 0) {
          return success(tool, version, installedPath, os);
        } else {
          // Andreas, 2023-05-03, issue #245.
          // Since we do not have the correct version, disable any default version.
          await exec(await ghcupBin(os, arch), ['unset', tool]);
        }
      } else {
        // Install method choco has precise install paths,
        // so if the install path is present, the tool should be present, too.
        return success(tool, version, installedPath, os);
      }
    }
  }
  return false;
}

export async function installTool(
  tool: Tool,
  version: string,
  os: OS,
  arch: Arch
): Promise<void> {
  if (await isInstalled(tool, version, os, arch)) return;
  warn(tool, version);

  if (tool === 'stack') {
    await stack(version, os, arch);
    if (await isInstalled(tool, version, os, arch)) return;
    return failed(tool, version);
  }

  switch (os) {
    case 'linux':
      if (tool === 'ghc' && version === 'head') {
        if (!(await aptBuildEssential())) break;

        await ghcupGHCHead();
        break;
      }
      // “version” may not be a semantic version (e.g. “latest-nightly”),
      // so guard “compareVersions” with “validate”.
      if (
        tool === 'ghc' &&
        validate(version) &&
        compareVersions(version, '8.3') < 0 // meaning version < 8.3
      ) {
        // Andreas, 2022-12-09: The following errors out if we are not ubuntu-20.04.
        // Atm, I do not know how to check whether we are on ubuntu-20.04.
        // So, ignore the error.
        // if (!(await aptLibCurses5())) break;
        await aptLibNCurses5();
      }
      await ghcup(tool, version, os, arch);
      break;
    case 'win32':
      await choco(tool, version);
      if (await isInstalled(tool, version, os, arch)) return;
      await ghcup(tool, version, os, arch);
      break;
    case 'darwin':
      await ghcup(tool, version, os, arch);
      break;
  }

  if (await isInstalled(tool, version, os, arch)) return;
  return failed(tool, version);
}

export async function resetTool(
  tool: Tool,
  _version: string,
  os: OS,
  arch: Arch
): Promise<void> {
  if (tool === 'stack') {
    // We don't need to do anything here... yet
    // (Once we switch to utilizing ghcup for stack when possible, we can
    // remove this early return)
    return;
  }

  let bin = '';
  switch (os) {
    case 'linux':
      bin = await ghcupBin(os, arch);
      await exec(bin, ['unset', tool]);
      return;
    case 'darwin':
      bin = await ghcupBin(os, arch);
      await exec(bin, ['unset', tool]);
      return;
    case 'win32':
      // We don't need to do anything here... yet
      return;
  }
}

async function stackArchString(arch: Arch): Promise<string> {
  switch (arch) {
    case 'arm64':
      return Promise.resolve('aarch64');
    case 'x64':
      return Promise.resolve('x86_64');
    default:
      const err = `Unsupported architecture: ${arch}`;
      core.error(err);
      return Promise.reject(err);
  }
}

async function stack(version: string, os: OS, arch: Arch): Promise<void> {
  const binArch = await stackArchString(arch);
  core.info(`Attempting to install stack ${version} for arch ${binArch}`);
  const build = {
    linux: `linux-${binArch}${
      compareVersions(version, '2.3.1') >= 0 ? '' : '-static'
    }`,
    darwin: `osx-${binArch}`,
    win32: 'windows-x86_64'
  }[os];

  const url = `https://github.com/commercialhaskell/stack/releases/download/v${version}/stack-${version}-${build}.tar.gz`;
  const p = await tc.downloadTool(`${url}`).then(tc.extractTar);
  const [stackPath] = await glob
    .create(`${p}/stack*`, {
      implicitDescendants: false
    })
    .then(async g => g.glob());
  await tc.cacheDir(stackPath, 'stack', version);
}

async function aptBuildEssential(): Promise<boolean> {
  core.info(`Installing build-essential using apt-get (for ghc-head)`);

  const returnCode = await exec(
    `sudo -- sh -c "apt-get update && apt-get -y install build-essential"`
  );
  return returnCode === 0;
}

async function aptLibNCurses5(): Promise<boolean> {
  core.info(
    `Installing libcurses5 and libtinfo5 using apt-get (for ghc < 8.3)`
  );

  // ubuntu-24.04 requires the specific source to install libncurses5 and libtinfo5,
  // see https://github.com/haskell-actions/setup/issues/101
  await exec(
    `sudo -- sh -c "echo 'deb https://security.ubuntu.com/ubuntu focal-security main universe' > /etc/apt/sources.list.d/ubuntu-focal-sources.list"`
  );
  const returnCode = await exec(
    `sudo -- sh -c "apt-get update && apt-get -y install libncurses5 libtinfo5"`
  );
  return returnCode === 0;
}

async function choco(tool: Tool, version: string): Promise<void> {
  core.info(`Attempting to install ${tool} ${version} using chocolatey`);

  // E.g. GHC version 7.10.3 on Chocolatey is revision 7.10.3.1.
  const revision: string = releaseRevision(version, tool, 'win32');

  // Choco tries to invoke `add-path` command on earlier versions of ghc, which has been deprecated and fails the step, so disable command execution during this.
  console.log('::stop-commands::SetupHaskellStopCommands');
  const args = [
    'choco',
    'install',
    tool,
    '--version',
    revision,
    // Andreas, 2023-03-13:
    // Removing the following (deprecated) option confuses getChocoPath, so we keep it for now.
    // TODO: remove this option and update ghc and cabal locations in getChocoPath.
    '--allow-multiple-versions',
    // Andreas, 2023-03-13, issue #202:
    // When installing GHC, skip automatic cabal installation.
    tool == 'ghc' ? '--ignore-dependencies' : '',
    // Verbosity options:
    '--no-progress',
    core.isDebug() ? '--debug' : '--limit-output'
  ];
  if ((await exec('powershell', args)) !== 0)
    await exec('powershell', [...args, '--pre']);
  console.log('::SetupHaskellStopCommands::'); // Re-enable command execution
  // Add GHC to path automatically because it does not add until the end of the step and we check the path.

  const chocoPath = await getChocoPath(tool, version, revision);

  if (tool == 'ghc') core.addPath(chocoPath);
}

async function ghcupBin(os: OS, arch: Arch): Promise<string> {
  core.debug(`ghcupBin : ${os}`);
  if (os === 'win32') {
    return 'ghcup';
  }
  const cachedBin = tc.find('ghcup', ghcup_version);
  if (cachedBin) return join(cachedBin, 'ghcup');

  const binArch = await stackArchString(arch);
  const bin = await tc.downloadTool(
    `https://downloads.haskell.org/ghcup/${ghcup_version}/${binArch}-${
      os === 'darwin' ? 'apple-darwin' : 'linux'
    }-ghcup-${ghcup_version}`
  );
  await afs.chmod(bin, 0o755);
  return join(
    await tc.cacheFile(bin, 'ghcup', 'ghcup', ghcup_version),
    'ghcup'
  );
}

export async function addGhcupReleaseChannel(
  channel: URL,
  os: OS,
  arch: Arch
): Promise<void> {
  core.info(`Adding ghcup release channel: ${channel}`);
  const bin = await ghcupBin(os, arch);
  await exec(bin, ['config', 'add-release-channel', channel.toString()]);
}

async function ghcup(
  tool: Tool,
  version: string,
  os: OS,
  arch: Arch
): Promise<void> {
  core.info(`Attempting to install ${tool} ${version} using ghcup`);
  const bin = await ghcupBin(os, arch);
  if (tool === 'cabal' && version === 'head') {
    await ghcupCabalHead(os, bin);
  } else {
    const returnCode = await exec(bin, ['install', tool, version]);
    if (returnCode === 0) await exec(bin, ['set', tool, version]);
  }
}

function cabalHeadUrlTag(os: OS): string {
  switch (os) {
    case 'linux':
      return 'Linux';
    case 'darwin':
      return 'macOS';
    case 'win32':
      return 'Windows';
  }
}

async function ghcupCabalHead(os: OS, bin: string): Promise<void> {
  const osTag = cabalHeadUrlTag(os);
  const cabalHeadUrl = `https://github.com/haskell/cabal/releases/download/cabal-head/cabal-head-${osTag}-x86_64.tar.gz`;
  const returnCode = await exec(bin, [
    'install',
    'cabal',
    '-u',
    cabalHeadUrl,
    'head'
  ]);
  if (returnCode === 0) await exec(bin, ['set', 'cabal', 'head']);
}

async function ghcupGHCHead(): Promise<void> {
  core.info(`Attempting to install ghc head using ghcup`);
  const bin = await ghcupBin('linux', 'x64');
  const returnCode = await exec(bin, [
    'install',
    'ghc',
    '-u',
    'https://gitlab.haskell.org/ghc/ghc/-/jobs/artifacts/master/raw/ghc-x86_64-deb9-linux-integer-simple.tar.xz?job=validate-x86_64-linux-deb9-integer-simple',
    'head'
  ]);
  if (returnCode === 0) await exec(bin, ['set', 'ghc', 'head']);
}

async function getChocoPath(
  tool: Tool,
  version: string,
  revision: string
): Promise<string> {
  // Environment variable 'ChocolateyToolsLocation' will be added to Hosted images soon
  // fallback to C:\\tools for now until variable is available
  core.debug(
    `getChocoPath(): ChocolateyToolsLocation = ${process.env.ChocolateyToolsLocation}`
  );
  const chocoToolsLocation =
    process.env.ChocolateyToolsLocation ??
    join(`${process.env.SystemDrive}`, 'tools');

  // choco packages GHC 9.x are installed on different path (C:\\tools\ghc-9.0.1)
  let chocoToolPath = join(chocoToolsLocation, `${tool}-${version}`);

  // choco packages GHC < 9.x
  if (!fs.existsSync(chocoToolPath)) {
    chocoToolPath = join(
      `${process.env.ChocolateyInstall}`,
      'lib',
      `${tool}.${revision}`
    );
  }
  core.debug(`getChocoPath(): chocoToolPath = ${chocoToolPath}`);

  const pattern = `${chocoToolPath}/**/${tool}.exe`;
  const globber = await glob.create(pattern);

  for await (const file of globber.globGenerator()) {
    core.debug(`getChocoPath(): found ${tool} at ${file}`);
    return dirname(file);
  }

  core.debug(`getChocoPath(): cannot find binary for ${tool}`);
  return '<not-found>';
}
