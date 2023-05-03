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
export type Arch = 'arm64' | 'x64';
export type Tool = 'cabal' | 'ghc' | 'stack';

export interface ProgramOpt {
  enable: boolean;
  raw: string;
  resolved: string;
}

export interface Options {
  ghc: ProgramOpt;
  ghcup: {releaseChannel?: URL};
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
 *     description: '...',
 *     default: false
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
 * Convert a string input to a boolean according to the YAML 1.2 "core schema" specification.
 * Supported boolean renderings: `true | True | TRUE | false | False | FALSE` .
 * ref: https://yaml.org/spec/1.2/spec.html#id2804923
 * Adapted from: https://github.com/actions/toolkit/commit/fbdf27470cdcb52f16755d32082f1fee0bfb7d6d#diff-f63fb32fca85d8e177d6400ce078818a4815b80ac7a3319b60d3507354890992R94-R115
 *
 * @param     name     name of the input
 * @param     val      supposed string representation of a boolean
 * @returns   boolean
 */
export function parseYAMLBoolean(name: string, val: string): boolean {
  const trueValue = ['true', 'True', 'TRUE'];
  const falseValue = ['false', 'False', 'FALSE'];
  if (trueValue.includes(val)) return true;
  if (falseValue.includes(val)) return false;
  throw new TypeError(
    `Action input "${name}" does not meet YAML 1.2 "Core Schema" specification: \n` +
      `Supported boolean values: \`true | True | TRUE | false | False | FALSE\``
  );
}

function parseBooleanInput(
  inputs: Record<string, string>,
  name: string,
  def: boolean
): boolean {
  const val = inputs[name];
  return val ? parseYAMLBoolean(name, val) : def;
}

/**
 * Parse two opposite boolean options, one with default 'true' and the other with default 'false'.
 * Return the value of the positive option.
 * E.g. 'enable-matcher: true' and 'disable-matcher: false' would result in 'true'.
 *
 * @param inputs    options as key-value map
 * @param positive  name (key) of the positive option (defaults to 'true')
 * @param negative  name (key) of the negative option (defaults to 'false')
 */
function parseOppositeBooleanInputs(
  inputs: Record<string, string>,
  positive: string,
  negative: string
): boolean {
  if (!inputs[negative]) {
    return parseBooleanInput(inputs, positive, true);
  } else if (!inputs[positive]) {
    return !parseBooleanInput(inputs, negative, false);
  } else {
    const pos = parseBooleanInput(inputs, positive, true);
    const neg = parseBooleanInput(inputs, negative, false);
    if (pos == !neg) {
      return pos;
    } else {
      throw new Error(
        `Action input ${positive}: ${pos} contradicts ${negative}: ${neg}`
      );
    }
  }
}

export function parseURL(name: string, val: string): URL | undefined {
  if (!val) return undefined;
  try {
    return new URL(val);
  } catch (e) {
    throw new TypeError(`Action input "${name}" is not a valid URL`);
  }
}

function parseURLInput(
  inputs: Record<string, string>,
  name: string
): URL | undefined {
  return parseURL(name, inputs[name]);
}

export function getOpts(
  {ghc, cabal, stack}: Defaults,
  os: OS,
  inputs: Record<string, string>
): Options {
  core.debug(`Inputs are: ${JSON.stringify(inputs)}`);
  const ghcVersion = inputs['ghc-version'];
  const cabalVersion = inputs['cabal-version'];
  const stackVersion = inputs['stack-version'];
  const stackNoGlobal = parseBooleanInput(inputs, 'stack-no-global', false);
  const stackSetupGhc = parseBooleanInput(inputs, 'stack-setup-ghc', false);
  const stackDefault = stackNoGlobal || stackSetupGhc || !!stackVersion;
  const stackEnable = parseBooleanInput(inputs, 'enable-stack', stackDefault);
  const ghcEnable = !stackNoGlobal;
  const cabalEnable = !stackNoGlobal;
  const cabalUpdate = parseBooleanInput(inputs, 'cabal-update', cabalEnable);
  const matcherEnable = parseOppositeBooleanInputs(
    inputs,
    'enable-matcher',
    'disable-matcher'
  );
  // disable-matcher is kept for backwards compatibility
  // positive options like enable-matcher are preferable
  const ghcupReleaseChannel = parseURLInput(inputs, 'ghcup-release-channel');
  const verInpt = {
    ghc: ghcVersion || ghc.version,
    cabal: cabalVersion || cabal.version,
    stack: stackVersion || stack.version
  };

  // Check inputs for consistency
  const errors = [];
  if (!stackEnable) {
    if (stackNoGlobal)
      errors.push(
        'Action input `enable-stack: false` contradicts `stack-no-global: true`'
      );
    if (stackSetupGhc)
      errors.push(
        'Action input `enable-stack: false` contradicts `stack-setup-ghc: true`'
      );
    if (stackVersion)
      errors.push(
        'Action input `enable-stack: false` contradicts setting `stack-version`'
      );
  }
  if (stackNoGlobal) {
    if (ghcVersion)
      errors.push(
        'Action input `stack-no-global: true` contradicts setting `ghc-version'
      );
    if (cabalVersion)
      errors.push(
        'Action input `stack-no-global: true` contradicts setting `cabal-version'
      );
  }
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

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
      releaseChannel: ghcupReleaseChannel
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
    general: {matcher: {enable: matcherEnable}}
  };

  core.debug(`Options are: ${JSON.stringify(opts)}`);
  return opts;
}
