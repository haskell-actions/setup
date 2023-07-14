import * as core from '@actions/core';
import run from './setup-haskell';

const getToggleInput = (name: string) => core.getInput(name) !== '';

const getBooleanInput = (name: string): boolean | undefined => {
  // https://github.com/actions/toolkit/issues/844
  if (!process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`]) {
    return undefined;
  }
  return core.getBooleanInput(name);
};

run({
  ghcVersion: core.getInput('ghc-version'),
  cabalVersion: core.getInput('cabal-version'),
  stackVersion: core.getInput('stack-version'),
  enableStack: getToggleInput('enable-stack'),
  stackNoGlobal: getToggleInput('stack-no-global'),
  stackSetupGhc: getToggleInput('stack-setup-ghc'),
  cabalUpdate: getBooleanInput('cabal-update'),
  ghcupReleaseChannels: core.getMultilineInput('ghcup-release-channels'),
  ghcupReleaseChannel: core.getInput('ghcup-release-channel'),
  disableMatcher: getToggleInput('disable-matcher')
});
