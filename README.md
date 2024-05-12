# BSS Soundweb Control for Companion v3

See [HELP.md](./companion/HELP.md) and [LICENSE](./LICENSE)

This module enables Companion to control BSS Soundweb London BLU devices such as:

- Soundweb BLU-806
- Soundweb BLU-160

This module is only compatible with Companion v3 and will be available in Companion from `v3.3.0`.

## Releases

### v1.0.1

Fixes and minor improvements.

- Fixes bug that stopped the module communicating due to nodes not being removed correctly from the connection watchdog.
- Minor improvements to logging to help direct users to the button where there is an issue with the configuration of an action or feedback.

### v1.0.0

This is the first release of the module and is compatible with Companion `v3.3.0` and later.

## Feature Roadmap

- [x] Custom parameter action
  - [x] Absolute set
  - [x] Relative set
- [x] Custom parameter feedback
  - [x] Comparison operators
  - [x] Add variable checkbox
- [x] Custom parameter variable feedback
- [x] Gain N-Input action
  - [x] Fader set
  - [x] Mute set
  - [ ] Fader set with fade time
- [x] Gain N-Input feedback
  - [x] Comparison operators
  - [x] Add variable
- [ ] Module variables
  - [ ] Node connection status
- [ ] Button Presets
  - [ ] Gain Mute
  - [ ] Gain Level Feedback
  - [ ] Gain Level Up
  - [ ] Gain Level Down
  - [ ] Gain Fade

# Development

## TODO

- Improve options parsing/validation and error reporting with Zod object schemas
- Abstract away comms/control methods from module instance class
- General cleanup

## Setup Node.js with fnm

It's recommended to use fnm for managing Node versions:
https://github.com/Schniz/fnm#installation

#### Install using Winget (Windows)

```powershell
winget install Schniz.fnm
```

#### Install using Homebrew (macOS/Linux)

```sh
brew install fnm
```

(See further below for specific instructions on setting up fnm for specific terminals.)

A [.node-version](.node-version) file has been provided, which means that once fnm is installed and the shell is correctly configured, in theory you can cd into the repo directoy and fnm should automatically switch to the correct version of Node and request to install it if it is not available.

If this doesn't work, just run `fnm use` and it should switch to the correct version of Node.

#### Enable Corepack

Once Node has been installed, be sure to enable corepack so you can use package managers such as yarn without installing them globally:

```sh
corepack enable
```

### Shell setup for fnm

#### Windows PowerShell

Add the following to the end of your profile file:

```powershell
fnm env --use-on-cd | Out-String | Invoke-Expression
```

On Windows, PowerShell comes pre-installed, but there are two versions of it. [Read more about it here](https://learn.microsoft.com/en-us/powershell/scripting/windows-powershell/install/installing-windows-powershell). The profile is located at different places depending on which version you're using:

- Built in PowerShell (aka "Windows PowerShell"): `~\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1`
- The newer, PowerShell >= 7, that's not built in: `~\Documents\PowerShell\Microsoft.PowerShell_profile.ps1`

#### Bash

Add the following to your `.bashrc` or `.zshrc` profile:

```bash
eval "$(fnm env --use-on-cd)"
```

The `.bashrc` or `.zshrc` file can typically be found in your home directory.

## Build

### Install Yarn

If you enabled corepack, then this should allow you to use `yarn` without installing it globally. However, if necessary (or preferable) you may install yarn globally by running:

```sh
npm install --global yarn
```

### Install project dependencies

Once you have cd'd into the root of the repo, simply run:

```sh
yarn
```

### Build/transpile the project

To build/transpile the project into Javascript, run the following, which calls a script in [package.json](package.json).

```sh
yarn build
```

### Run development scripts

This activates the file watcher so as you update Typescript files, they are automatically transpiled into Javascript.

```sh
yarn dev
```

## Run the module in Companion

To run the module in Companion, you need to provide Companion a path to a directory containing your development modules. This can be done from the desktop server application window. Click the gear icon and a 'Developer Modules Path' field appears, where you can set the path.

Once this has been done, Companion will watch the files in your development path and will 'live reload' any modules whose files have been changed.

Companion imports/runs the file identified in [mainfest.json](companion/manifest.json) under `runtime.entrypoint`. This should be the transpiled (.js) version of [main.ts](src/main.ts), which will appear at: `dist/main.js`, but only once the project has been built using `yarn build` or `yarn dev`.

Once you have built the project, you can run `yarn dev` as detailed above, which will then watch your source code and auto-transpile typescript to javascript as you work. In turn, Companion will then live reload any edited development modules automatically.

## Version bumping

### Releases

`yarn version --major`

`yarn version --minor`

`yarn version --patch`

### Pre-releases

`yarn version --premajor --preid rc`

`yarn version --preminor --preid rc`

`yarn version --prepatch --preid rc`

### Betas

`yarn version --premajor --preid beta`

`yarn version --preminor --preid beta`

`yarn version --prepatch --preid beta`
