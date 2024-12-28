import * as core from '@actions/core';
import * as io from '@actions/io';
import ensureError from 'ensure-error';
import * as fs from 'fs';
import * as path from 'path';
import {EOL} from 'os';
import {getOpts, getDefaults, Tool} from './opts';
import {
  addGhcupReleaseChannel,
  configureGhcupOutput,
  installTool,
  resetTool
} from './installer';
import type {Arch, OS} from './opts';
import {exec} from '@actions/exec';

async function cabalConfig(): Promise<string> {
  let out = Buffer.from('');
  const append = (b: Buffer): Buffer => (out = Buffer.concat([out, b]));
  await exec('cabal', ['--help'], {
    silent: true,
    listeners: {stdout: append, stderr: append}
  });
  // The last line of the cabal help text is printing the config file, e.g.:
  //
  // > You can edit the cabal configuration file to set defaults:
  // >   <<HOME>>/.cabal/config
  //
  // So trimming the last line will give us the name of the config file.
  //
  // Needless to say this is very brittle, but we secure this by a test
  // in Cabal's testsuite:  https://github.com/haskell/cabal/pull/9614
  return out.toString().trim().split('\n').slice(-1)[0].trim();
}

export default async function run(
  inputs: Record<string, string>
): Promise<void> {
  try {
    core.info('Preparing to setup a Haskell environment');
    const os = process.platform as OS;
    const arch = process.arch as Arch;
    const opts = getOpts(getDefaults(os), os, inputs);
    core.debug(`run: inputs = ${JSON.stringify(inputs)}`);
    core.debug(`run: os     = ${JSON.stringify(os)}`);
    core.debug(`run: opts   = ${JSON.stringify(opts)}`);

    await configureGhcupOutput(os, arch);

    if (opts.ghcup.releaseChannel) {
      await core.group(`Preparing ghcup environment`, async () =>
        addGhcupReleaseChannel(opts.ghcup.releaseChannel!, os, arch)
      );
    }

    for (const [t, {resolved}] of Object.entries(opts).filter(
      o => o[1].enable
    )) {
      await core.group(`Preparing ${t} environment`, async () =>
        resetTool(t as Tool, resolved, os, arch)
      );
      await core.group(`Installing ${t} version ${resolved}`, async () =>
        installTool(t as Tool, resolved, os, arch)
      );
    }

    if (opts.stack.setup)
      await core.group('Pre-installing GHC with stack', async () =>
        exec('stack', ['setup', opts.ghc.resolved])
      );

    if (opts.cabal.enable)
      await core.group('Setting up cabal', async () => {
        // Andreas, 2023-03-16, issue #210.
        // Create .cabal/bin to activate non-XDG mode of cabal.
        if (process.platform !== 'win32')
          io.mkdirP(`${process.env.HOME}/.cabal/bin`);

        // Create config only if it doesn't exist.
        await exec('cabal', ['user-config', 'init'], {
          silent: true,
          ignoreReturnCode: true
        });

        // Set the 'store-dir' in the cabal configuration.
        // Blindly appending is fine.
        // Cabal merges these and picks the last defined option.
        const configFile = await cabalConfig();
        const storeDir =
          process.platform === 'win32'
            ? 'C:\\sr'
            : `${process.env.HOME}/.cabal/store`;
        fs.appendFileSync(configFile, `store-dir: ${storeDir}${EOL}`);
        core.setOutput('cabal-store', storeDir);
        if (process.platform === 'win32') {
          // Some Windows version cannot symlink, so we need to switch to 'install-method: copy'.
          // Choco does this for us, but not GHCup: https://github.com/haskell/ghcup-hs/issues/808
          // However, here we do not know whether we installed with choco or not, so do it always:
          fs.appendFileSync(configFile, `install-method: copy${EOL}`);
          fs.appendFileSync(configFile, `overwrite-policy: always${EOL}`);
        } else {
          // Issue #130: for non-choco installs, add ~/.cabal/bin to PATH
          const installdir = `${process.env.HOME}/.cabal/bin`;
          core.info(`Adding ${installdir} to PATH`);
          core.addPath(installdir);
        }

        // Workaround the GHC nopie linking errors for ancient GHC versions
        // NB: Is this _just_ for GHC 7.10.3?
        if (opts.ghc.resolved === '7.10.3' && os !== 'win32') {
          fs.appendFileSync(
            configFile,
            ['program-default-options', '  ghc-options: -optl-no-pie'].join(
              EOL
            ) + EOL
          );

          // We cannot use cabal user-config to normalize the config because of:
          // https://github.com/haskell/cabal/issues/6823
          // await exec('cabal user-config update');
        }
        if (opts.cabal.update && !opts.stack.enable) await exec('cabal update');
      });

    core.info(`##[add-matcher]${path.join(__dirname, '..', 'matcher.json')}`);
  } catch (_error) {
    const error = ensureError(_error);
    if (core.isDebug()) {
      // we don't fail here so that the error path can be tested in CI
      core.setOutput('failed', true);
      core.debug(error.message);
    } else {
      core.setFailed(error.message);
    }
  }
}
