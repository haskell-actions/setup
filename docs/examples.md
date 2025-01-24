### Minimal

```yaml
on: [push]
name: build
jobs:
  runhaskell:
    name: Hello World
    runs-on: ubuntu-latest # or macOS-latest, or windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: haskell-actions/setup@v2
      - run: runhaskell Hello.hs
```

### Basic

```yaml
on: [push]
name: build
jobs:
  runhaskell:
    name: Hello World
    runs-on: ubuntu-latest # or macOS-latest, or windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: haskell-actions/setup@v2
        with:
          ghc-version: '8.8' # Resolves to the latest point release of GHC 8.8
          cabal-version: '3.0.0.0' # Exact version of Cabal
      - run: runhaskell Hello.hs
```

### Basic with Stack

```yaml
on: [push]
name: build
jobs:
  runhaskell:
    name: Hello World
    runs-on: ubuntu-latest # or macOS-latest, or windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: haskell-actions/setup@v2
        with:
          ghc-version: '8.8.4' # Exact version of ghc to use
          # cabal-version: 'latest'. Omitted, but defaults to 'latest'
          enable-stack: true
          stack-version: 'latest'
      - run: runhaskell Hello.hs
```

### Matrix Testing

```yaml
on: [push]
name: build
jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        ghc: ['8.6.5', '8.8.4']
        cabal: ['2.4.1.0', '3.0.0.0']
        os: [ubuntu-latest, macOS-latest, windows-latest]
        exclude:
          # GHC 8.8+ only works with cabal v3+
          - ghc: 8.8.4
            cabal: 2.4.1.0
    name: Haskell GHC ${{ matrix.ghc }} sample
    steps:
      - uses: actions/checkout@v4
      - name: Setup Haskell
        uses: haskell-actions/setup@v2
        with:
          ghc-version: ${{ matrix.ghc }}
          cabal-version: ${{ matrix.cabal }}
      - run: runhaskell Hello.hs
```

### Multiple GHC versions

If you need multiple versions of GHC installed at the same time, it is possible
to run the action twice.

```yaml
- uses: haskell-actions/setup@v2
  with:
    ghc-version: '9.8.2'

- uses: haskell-actions/setup@v2
  with:
    ghc-version: '8.10.7'
```

### Model cabal workflow with caching

```yaml
name: build
on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

# INFO: The following configuration block ensures that only one build runs per branch,
# which may be desirable for projects with a costly build process.
# Remove this block from the CI workflow to let each CI job run to completion.
concurrency:
  group: build-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    name: GHC ${{ matrix.ghc-version }} on ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest]
        ghc-version: ['9.8', '9.6', '9.4', '9.2', '9.0']

        include:
          - os: windows-latest
            ghc-version: '9.8'
          - os: macos-latest
            ghc-version: '9.8'

    steps:
      - uses: actions/checkout@v4

      - name: Set up GHC ${{ matrix.ghc-version }}
        uses: haskell-actions/setup@v2
        id: setup
        with:
          ghc-version: ${{ matrix.ghc-version }}
          # Defaults, added for clarity:
          cabal-version: 'latest'
          cabal-update: true

      - name: Configure the build
        run: |
          cabal configure --enable-tests --enable-benchmarks --disable-documentation
          cabal build all --dry-run
        # The last step generates dist-newstyle/cache/plan.json for the cache key.

      - name: Restore cached dependencies
        uses: actions/cache/restore@v4
        id: cache
        env:
          key: ${{ runner.os }}-ghc-${{ steps.setup.outputs.ghc-version }}-cabal-${{ steps.setup.outputs.cabal-version }}
        with:
          path: ${{ steps.setup.outputs.cabal-store }}
          key: ${{ env.key }}-plan-${{ hashFiles('**/plan.json') }}
          restore-keys: ${{ env.key }}-

      - name: Install dependencies
        # If we had an exact cache hit, the dependencies will be up to date.
        if: steps.cache.outputs.cache-hit != 'true'
        run: cabal build all --only-dependencies

      # Cache dependencies already here, so that we do not have to rebuild them should the subsequent steps fail.
      - name: Save cached dependencies
        uses: actions/cache/save@v4
        # If we had an exact cache hit, trying to save the cache would error because of key clash.
        if: steps.cache.outputs.cache-hit != 'true'
        with:
          path: ${{ steps.setup.outputs.cabal-store }}
          key: ${{ steps.cache.outputs.cache-primary-key }}

      - name: Build
        run: cabal build all

      - name: Run tests
        run: cabal test all

      - name: Check cabal file
        run: cabal check

      - name: Build documentation
        run:
          cabal haddock all --disable-documentation
          # --disable-documentation disables building documentation for dependencies.
          # The package's own documentation is still built,
          # yet contains no links to the documentation of the dependencies.
```

Alternatively, the two occurrences of `--disable-documentation` can be changed to `--enable-documentation`, for resolving the external references to the documentation of the dependencies.
This will increase build times a bit, though.

### Dependency updates

You can use [Renovate](https://www.mend.io/renovate/) to detect
if dependencies do not allow the latest version.

If you install [the Renovate Github app](https://github.com/apps/renovate), it
will submit a PR with configuration to your repository.

The following option can be added to that PR. It embeds new dependency versions in a
[git trailer](https://alchemists.io/articles/git_trailers):

```
"commitBody": "New-Versions:\n{{#each upgrades}}  {{{depName}}}=={{{newVersion}}}\n{{/each}}"
```

These new versions can then be saved to `cabal.project` in a workflow step.
Insert the following before the `cabal configure` step:

```
- name: Extract New-Versions git trailer from Renovate
  if: ${{ github.event_name == "pull_request" }}
  run: |
    if [ ! -f cabal.project ]
      then echo "packages: ." > cabal.project
    fi
    for constraint in $(git log "--format=%(trailers:key=New-Versions,valueonly=true)" ${{ github.event.pull_request.head.sha }} -1)
      do echo "constraints: $constraint" >> cabal.project
    done
```

Note that a Cabal constraint can't change the version of GHC used. So you may
want to add [ignoreDeps](https://docs.renovatebot.com/configuration-options/#ignoredeps)
to ignore updates for [boot libraries](https://gitlab.haskell.org/ghc/ghc/-/wikis/commentary/libraries/version-history).

You can also enable [osvVulnerabilityAlerts](https://docs.renovatebot.com/configuration-options/#osvvulnerabilityalerts) to receive
alerts from the [Haskell Security Advisory Database](https://haskell.github.io/security-advisories/).
