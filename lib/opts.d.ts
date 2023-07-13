/// <reference types="node" />
export declare const release_revisions: Revisions;
export declare const supported_versions: Record<Tool, string[]>;
export declare const ghcup_version: string;
export type Revisions = Record<OS, Record<Tool, Array<{
    from: string;
    to: string;
}>>>;
export type OS = 'linux' | 'darwin' | 'win32';
export type Tool = 'cabal' | 'ghc' | 'stack';
export interface ProgramOpt {
    enable: boolean;
    raw: string;
    resolved: string;
}
export interface Options {
    ghc: ProgramOpt;
    ghcup: {
        releaseChannels: URL[];
    };
    cabal: ProgramOpt & {
        update: boolean;
    };
    stack: ProgramOpt & {
        setup: boolean;
    };
    general: {
        matcher: {
            enable: boolean;
        };
    };
}
type Version = {
    version: string;
    supported: string[];
};
export type Defaults = Record<Tool, Version> & {
    general: {
        matcher: {
            enable: boolean;
        };
    };
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
export declare const yamlInputs: Record<string, {
    default: string;
}>;
export declare function getDefaults(os: OS): Defaults;
export declare function releaseRevision(version: string, tool: Tool, os: OS): string;
export type RawInputs = {
    ghcVersion?: string;
    cabalVersion?: string;
    stackVersion?: string;
    enableStack?: boolean;
    stackNoGlobal?: boolean;
    stackSetupGhc?: boolean;
    cabalUpdate?: boolean;
    ghcupReleaseChannels?: string[];
    ghcupReleaseChannel?: string;
    disableMatcher?: boolean;
};
export declare function getOpts({ ghc, cabal, stack }: Defaults, os: OS, inputs: RawInputs): Options;
export {};
