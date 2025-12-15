# haskell-actions/setup

[![GitHub Actions status](https://github.com/haskell-actions/setup/actions/workflows/workflow.yml/badge.svg)](https://github.com/haskell-actions/setup/actions/workflows/workflow.yml)

This action sets up a Haskell environment for use in actions by:

- if requested, installing a version of [ghc](https://downloads.haskell.org/~ghc/latest/docs/html/users_guide/) and [cabal](https://www.haskell.org/cabal/) and adding them to `PATH`,
- if requested, installing a version of [Stack](https://haskellstack.org) and adding it to the `PATH`,
- outputting of `ghc-version/exe/path`, `cabal-version/exe/path`, `stack-version/exe/path`, `stack-root` and `cabal-store` (for the requested components).

The GitHub runners come with [pre-installed versions of GHC and Cabal](https://github.com/actions/runner-images).
Those will be used whenever possible.
For all other versions, this action utilizes
[`ghcup`](https://github.com/haskell/ghcup-hs), and
[`chocolatey`](https://chocolatey.org/packages/ghc).

## Usage

See [action.yml](action.yml) and [docs/examples.md](docs/examples.md).

## Inputs

| Name                    | Description                                                                                                                                 | Type      | Default     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------- |
| `ghc-version`           | GHC version to use, e.g. `9.2` or `9.2.5`.                                                                                                  | `string`  | `latest`    |
| `cabal-version`         | Cabal version to use, e.g. `3.6`.                                                                                                           | `string`  | `latest`    |
| `stack-version`         | Stack version to use, e.g. `latest`. Stack will only be installed if `enable-stack` is set.                                                 | `string`  | `latest`    |
| `enable-stack`          | If set, will setup Stack.                                                                                                                   | "boolean" | false/unset |
| `stack-no-global`       | If set, `enable-stack` must be set. Prevents installing GHC and Cabal globally.                                                             | "boolean" | false/unset |
| `stack-setup-ghc`       | If set, `enable-stack` must be set. Runs stack setup to install the specified GHC. (Note: setting this does _not_ imply `stack-no-global`.) | "boolean" | false/unset |
| `disable-matcher`       | If set, disables match messages from GHC as GitHub CI annotations.                                                                          | "boolean" | false/unset |
| `cabal-update`          | If set to `false`, skip `cabal update` step.                                                                                                | `boolean` | `true`      |
| `ghcup-release-channel` | If set, add a [release channel](https://www.haskell.org/ghcup/guide/#metadata) to ghcup.                                                    | `URL`     | none        |

Note: "boolean" types are set/unset, not true/false.
That is, setting any "boolean" to a value other than the empty string (`""`) will be considered true/set.
However, to avoid confusion and for forward compatibility, it is still recommended to **only use value `true` to set a "boolean" flag.**

In contrast, a proper `boolean` input like `cabal-update` only accepts values `true` and `false`.

## Outputs

The action outputs parameters for the components it installed.
E.g. if `ghc-version: 8.10` is requested, the action will output `ghc-version: 8.10.7` if installation succeeded,
and `ghc-exe` and `ghc-path` will be set accordingly.
(Details on version resolution see next section.)

| Name            | Description                                                                                                                | Type   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- | ------ |
| `ghc-version`   | The resolved version of `ghc`                                                                                              | string |
| `cabal-version` | The resolved version of `cabal`                                                                                            | string |
| `stack-version` | The resolved version of `stack`                                                                                            | string |
| `ghc-exe`       | The path of the `ghc` _executable_                                                                                         | string |
| `cabal-exe`     | The path of the `cabal` _executable_                                                                                       | string |
| `stack-exe`     | The path of the `stack` _executable_                                                                                       | string |
| `ghc-path`      | The path of the `ghc` executable _directory_                                                                               | string |
| `cabal-path`    | The path of the `cabal` executable _directory_                                                                             | string |
| `stack-path`    | The path of the `stack` executable _directory_                                                                             | string |
| `cabal-store`   | The path to the cabal store                                                                                                | string |
| `stack-root`    | The path to the stack root (equal to the `STACK_ROOT` environment variable if it is set; otherwise an OS-specific default) | string |

## Version Support

This action is conscious about the tool versions specified in [`versions.json`](src/versions.json).
This list is replicated (hopefully correctly) below.

Versions specified by the inputs, e.g. `ghc-version`, are resolved against this list,
by taking the first entry from the list if `latest` is requested,
or the first entry that matches exactly,
or otherwise the first entry that is a (string-)extension of the requested version extended by a `.`.
E.g., `8.10` will be resolved to `8.10.7`, and so will `8`.

**GHC:**

- `latest-nightly` (requires the resp. `ghcup-release-channel`, e.g. `https://ghc.gitlab.haskell.org/ghcup-metadata/ghcup-nightlies-0.0.7.yaml`)
- `latest` (default)
- `9.12.2` `9.12`
- `9.12.1`
- `9.10.3` `9.10`
- `9.10.2`
- `9.10.1`
- `9.8.4` `9.8`
- `9.8.2`
- `9.8.1`
- `9.6.7` `9.6`
- `9.6.6`
- `9.6.5`
- `9.6.4`
- `9.6.3`
- `9.6.2`
- `9.6.1`
- `9.4.8` `9.4`
- `9.4.7`
- `9.4.6`
- `9.4.5`
- `9.4.4`
- `9.4.3`
- `9.4.2`
- `9.4.1`
- `9.2.8` `9.2`
- `9.2.7`
- `9.2.6`
- `9.2.5`
- `9.2.4`
- `9.2.3`
- `9.2.2`
- `9.2.1`
- `9.0.2` `9.0`
- `9.0.1`
- `8.10.7` `8.10`
- `8.10.6`
- `8.10.5`
- `8.10.4`
- `8.10.3`
- `8.10.2`
- `8.10.1`
- `8.8.4` `8.8`
- `8.8.3`
- `8.8.2`
- `8.8.1`
- `8.6.5` `8.6`
- `8.6.4`
- `8.6.3`
- `8.6.2`
- `8.6.1`
- `8.4.4` `8.4`
- `8.4.3`
- `8.4.2`
- `8.4.1`
- `8.2.2` `8.2`
- `8.0.2` `8.0`

Suggestion: Try to support at least the three latest major versions of GHC.

**Cabal:**

- `head` (the [cabal-head](https://github.com/haskell/cabal/releases/tag/cabal-head) release of the most recent build of the `master` branch)
- `latest` (default, recommended)
- `3.16.0.0` `3.16`
- `3.14.2.0` `3.14`
- `3.14.1.1`
- `3.14.1.0`
- `3.12.1.0` `3.12`
- `3.10.3.0` `3.10`
- `3.10.2.1`
- `3.10.2.0`

Older versions of `cabal` are not supported due to vulnerability [HSEC-2023-0015](https://github.com/haskell/security-advisories/blob/cea5781acfc2adb9bc02486497d782072c613bb6/advisories/hackage/cabal-install/HSEC-2023-0015.md).

Recommendation: Use the latest available version if possible.

**Stack:** (with `enable-stack: true`)

- `latest` (default, recommended)
- `3.7.1` `3.7`
- `3.5.1` `3.5`
- `3.3.1` `3.3`
- `3.1.1` `3.1`
- `2.15.7` `2.15`
- `2.15.5`
- `2.15.3`
- `2.15.1`
- `2.13.1` `2.13`
- `2.11.1` `2.11`
- `2.9.3` `2.9`
- `2.9.1`
- `2.7.5` `2.7`
- `2.7.3`
- `2.7.1`
- `2.5.1` `2.5`
- `2.3.3` `2.3`
- `2.3.1`
- `2.1.3` `2.1`
- `2.1.1`
- `1.9.3.1` `1.9`
- `1.9.1.1`
- `1.7.1` `1.7`
- `1.6.5` `1.6`
- `1.6.3.1`
- `1.6.1.1`
- `1.5.1` `1.5`
- `1.5.0`
- `1.4.0` `1.4`
- `1.3.2` `1.3`
- `1.3.0`
- `1.2.0` `1.2`

Recommendation: Use the latest available version if possible.

Beyond the officially supported listed versions above, you can request any precise version of
[GHC](https://www.haskell.org/ghc/download.html),
[Cabal](https://www.haskell.org/cabal/download.html), and
[Stack](https://github.com/commercialhaskell/stack/tags).
The action will forward the request to the install methods (apt, ghcup, choco), and installation might succeed.

Note however that Chocolatey's version numbers might differ from the official ones,
please consult their pages for
[GHC](https://chocolatey.org/packages/ghc#versionhistory) and
[Cabal](https://chocolatey.org/packages/cabal#versionhistory).

## License

The scripts and documentation in this project are released under the [MIT License](LICENSE).

## Contributions

Contributions are welcome! See the [Contributor's Guide](docs/contributors.md).
