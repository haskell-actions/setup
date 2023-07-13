import * as core from '@actions/core';
import {readFileSync} from 'fs';
import {load} from 'js-yaml';
import {join} from 'path';
import * as sv from './versions.json';
import * as rv from './release-revisions.json';

export const release_revisions = rv as Revisions;
export const supported_versions = sv as Record<Tool, string[]>;
export const ghcup_version = sv.ghcup[0]; // Known to be an array of length 1

export type Revisions = Record<
  OS,
  Record<Tool, Array<{from: string; to: string}>>
>;
export type OS = 'linux' | 'darwin' | 'win32';
export type Tool = 'cabal' | 'ghc' | 'stack';

export interface ProgramOpt {
  enable: boolean;
  raw: string;
  resolved: string;
}

export interface Options {
  ghc: ProgramOpt;
  ghcup: {releaseChannels: URL[]};
  cabal: ProgramOpt & {update: boolean};
  stack: ProgramOpt & {setup: boolean};
  general: {matcher: {enable: boolean}};
}

type Version = {version: string; supported: string[]};
export type Defaults = Record<Tool, Version> & {
  general: {matcher: {enable: boolean}};
};

/**
 * Reads the example `actions.yml` file and selects the `inputs` key. The result
 * will be a key-value map of the following shape:
 * ```
 * {
 *   'ghc-version': {
 *     required: false,
 *     description: '...',
 *     default: 'latest'
 *   },
 *   'cabal-version': {
 *     required: false,
 *     description: '...',
 *     default: 'latest'
 *   },
 *   'stack-version': {
 *     required: false,
 *     description: '...',
 *     default: 'latest'
 *   },
 *   'enable-stack': {
 *     required: false,
 *     default: 'latest'
 *   },
 *   ...
 * }
 * ```
 */
export const yamlInputs: Record<string, {default: string}> = (
  load(
    readFileSync(join(__dirname, '..', 'action.yml'), 'utf8')
    // The action.yml file structure is statically known.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any
).inputs;

export function getDefaults(os: OS): Defaults {
  const mkVersion = (v: string, vs: string[], t: Tool): Version => ({
    version: resolve(yamlInputs[v].default, vs, t, os, false), // verbose=false: no printout here
    supported: vs
  });

  return {
    ghc: mkVersion('ghc-version', supported_versions.ghc, 'ghc'),
    cabal: mkVersion('cabal-version', supported_versions.cabal, 'cabal'),
    stack: mkVersion('stack-version', supported_versions.stack, 'stack'),
    general: {matcher: {enable: true}}
  };
}

// E.g. resolve ghc latest to 9.4.2
// resolve ghc 8.1 to 8.10.7 (bug, https://github.com/haskell/actions/issues/248)
function resolve(
  version: string,
  supported: string[],
  tool: Tool,
  os: OS,
  verbose: boolean // If resolution isn't the identity, print what resolved to what.
): string {
  const result =
    version === 'latest'
      ? supported[0]
      : supported.find(v => v === version) ??
        supported.find(v => v.startsWith(version + '.')) ??
        // Andreas, 2023-05-19, issue #248
        // Append "." so that eg stack "2.1" resolves to "2.1.3" and not "2.11.1".
        version;
  // Andreas 2022-12-29, issue #144: inform about resolution here where we can also output ${tool}.
  if (verbose === true && version !== result)
    core.info(`Resolved ${tool} ${version} to ${result}`);
  return result;
}

// Further resolve the version to a revision using release-revisions.json.
// This is only needed for choco-installs (at time of writing, 2022-12-29).
export function releaseRevision(version: string, tool: Tool, os: OS): string {
  const result: string =
    release_revisions?.[os]?.[tool]?.find(({from}) => from === version)?.to ??
    version;
  return result;
}

/**
 * Parse a string as a comma-separated list.
 */
function parseCSV(val: string): string[] {
  return val
    .split(',')
    .map(s => s.trim())
    .filter(s => s != '');
}

export type RawInputs = {
  ghcVersion?: string;
  cabalVersion?: string;
  stackVersion?: string;
  enableStack?: boolean;
  stackNoGlobal?: boolean;
  stackSetupGhc?: boolean;
  cabalUpdate?: boolean;
  ghcupReleaseChannels?: string;
  ghcupReleaseChannel?: string;
  disableMatcher?: boolean;
};

export function getOpts(
  {ghc, cabal, stack}: Defaults,
  os: OS,
  inputs: RawInputs
): Options {
  core.debug(`Inputs are: ${JSON.stringify(inputs)}`);

  const stackNoGlobal = inputs.stackNoGlobal ?? false;
  const stackSetupGhc = inputs.stackSetupGhc ?? false;
  const stackEnable = inputs.enableStack ?? false;
  const cabalUpdate = inputs.cabalUpdate ?? true;
  const matcherDisable = inputs.disableMatcher ?? false;

  if (inputs.ghcupReleaseChannel) {
    core.warning(
      'ghcup-release-channel is deprecated in favor of ghcup-release-channels'
    );
    inputs.ghcupReleaseChannels = inputs.ghcupReleaseChannel;
  }

  const ghcupReleaseChannels = parseCSV(inputs.ghcupReleaseChannels ?? '').map(
    v => {
      try {
        return new URL(v);
      } catch (e) {
        throw new TypeError(`Not a valid URL: ${v}`);
      }
    }
  );

  core.debug(`${stackNoGlobal}/${stackSetupGhc}/${stackEnable}`);
  const verInpt = {
    ghc: inputs.ghcVersion || ghc.version,
    cabal: inputs.cabalVersion || cabal.version,
    stack: inputs.stackVersion || stack.version
  };

  const errors = [];
  if (stackNoGlobal && !stackEnable) {
    errors.push('enable-stack is required if stack-no-global is set');
  }

  if (stackSetupGhc && !stackEnable) {
    errors.push('enable-stack is required if stack-setup-ghc is set');
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  const ghcEnable = !stackNoGlobal;
  const cabalEnable = !stackNoGlobal;
  const opts: Options = {
    ghc: {
      raw: verInpt.ghc,
      resolved: resolve(
        verInpt.ghc,
        ghc.supported,
        'ghc',
        os,
        ghcEnable // if true: inform user about resolution
      ),
      enable: ghcEnable
    },
    ghcup: {
      releaseChannels: ghcupReleaseChannels
    },
    cabal: {
      raw: verInpt.cabal,
      resolved: resolve(
        verInpt.cabal,
        cabal.supported,
        'cabal',
        os,
        cabalEnable // if true: inform user about resolution
      ),
      enable: cabalEnable,
      update: cabalUpdate
    },
    stack: {
      raw: verInpt.stack,
      resolved: resolve(
        verInpt.stack,
        stack.supported,
        'stack',
        os,
        stackEnable // if true: inform user about resolution
      ),
      enable: stackEnable,
      setup: stackSetupGhc
    },
    general: {matcher: {enable: !matcherDisable}}
  };

  core.debug(`Options are: ${JSON.stringify(opts)}`);
  return opts;
}
