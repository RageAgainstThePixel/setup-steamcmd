# setup-steamcmd

Sets up `steamcmd` command alias for Github Action Runners.

## Exported Env Vars

- `STEAM_CMD` the `steamcmd` directory location.
- `STEAM_DIR` the steam install directory location.

## How to use

```yaml
jobs:
  validate:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ macos-latest, windows-latest, ubuntu-latest ]

    steps:
      - uses: actions/checkout@v4
      - uses: RageAgainstThePixel/setup-steamcmd@v1
      - run: |
          which steamcmd
          steamcmd +help +quit
```

for a list of `steamcmd` commands see [this list](https://github.com/dgibbs64/SteamCMD-Commands-List).
