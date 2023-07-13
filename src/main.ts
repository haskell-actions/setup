import * as core from '@actions/core';
import run from './setup-haskell';

run({
  ghcVersion: core.getInput('ghc-version'),
  cabalVersion: core.getInput('cabal-version'),
  stackVersion: core.getInput('stack-version'),
  enableStack: core.getInput('enable-stack'),
  stackNoGlobal: core.getInput('stack-no-global'),
  stackSetupGhc: core.getInput('stack-setup-ghc'),
  cabalUpdate: core.getInput('cabal-update'),
  ghcupReleaseChannels: core.getInput('ghcup-release-channels'),
  ghcupReleaseChannel: core.getInput('ghcup-release-channel'),
  disableMatcher: core.getInput('disable-matcher')
});
