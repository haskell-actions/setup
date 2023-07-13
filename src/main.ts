import * as core from '@actions/core';
import run from './setup-haskell';

const getToggleInput = (name: string) => core.getInput(name) !== '';

run({
  ghcVersion: core.getInput('ghc-version'),
  cabalVersion: core.getInput('cabal-version'),
  stackVersion: core.getInput('stack-version'),
  enableStack: getToggleInput('enable-stack'),
  stackNoGlobal: getToggleInput('stack-no-global'),
  stackSetupGhc: getToggleInput('stack-setup-ghc'),
  cabalUpdate: core.getBooleanInput('cabal-update'),
  ghcupReleaseChannels: core.getMultilineInput('ghcup-release-channels'),
  ghcupReleaseChannel: core.getInput('ghcup-release-channel'),
  disableMatcher: getToggleInput('disable-matcher')
});
