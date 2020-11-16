# @percy/protractor

[![Version](https://img.shields.io/npm/v/@percy/protractor.svg)](https://www.npmjs.com/package/@percy/protractor)
![Test](https://github.com/percy/percy-protractor/workflows/Test/badge.svg)

[Percy](https://percy.io) visual testing for [Protractor](https://www.protractortest.org/).

## Installation

Using yarn:

```sh-session
$ yarn add --dev @percy/cli @percy/protractor@next
```

Using npm:

```sh-session
$ npm install --save-dev @percy/cli @percy/protractor@next
```
## Usage

This is an example using the `percySnapshot()` function using
[async/await](https://www.protractortest.org/#/async-await).

```javascript
import percySnapshot from '@percy/protractor';

describe('angularjs homepage', function() {
  it('should greet the named user', async function() {
    await browser.get('http://www.angularjs.org');
    await percySnapshot('AngularJS homepage');

    await element(by.model('yourName')).sendKeys('Percy');
    var greeting = element(by.binding('yourName'));
    expect(await greeting.getText()).toEqual('Hello Percy!');

    await percySnapshot('AngularJS homepage greeting');
  });
});
```

Running the test above will result in the following log:

```sh-session
$ protractor conf.js
...

[percy] Percy is not running, disabling snapshots
  ✓ angularjs homepage should greet the named user

  1 passing (1s)
```

When running with [`percy
exec`](https://github.com/percy/cli/tree/master/packages/cli-exec#percy-exec), and your project's
`PERCY_TOKEN`, a new Percy build will be created and snapshots will be uploaded to your project.

```sh-session
$ export PERCY_TOKEN=[your-project-token]
$ percy exec -- protractor conf.js
[percy] Percy has started!
[percy] Created build #1: https://percy.io/[your-project]
[percy] Running "protractor conf.js"
...

[percy] Snapshot taken "AngularJS homepage"
[percy] Snapshot taken "AngularJS homepage greeting"
  ✓ angularjs homepage should greet the named user

  1 passing (1s)

...
[percy] Stopping percy...
[percy] Finalized build #1: https://percy.io/[your-project]
[percy] Done!
```

## Configuration

`percySnapshot(name[, options])`

- `name` (**required**) - The snapshot name; must be unique to each snapshot
- `options` - Additional snapshot options (overrides any project options)
  - `options.widths` - An array of widths to take screenshots at
  - `options.minHeight` - The minimum viewport height to take screenshots at
  - `options.percyCSS` - Percy specific CSS only applied in Percy's rendering environment
  - `options.requestHeaders` - Headers that should be used during asset discovery
  - `options.enableJavaScript` - Enable JavaScript in Percy's rendering environment

## Upgrading

If you're coming from a pre-2.0 version of this package, make sure to install `@percy/cli` after
upgrading to retain any existing scripts that reference the Percy CLI command.

Using yarn:

```sh-session
$ yarn add --dev @percy/cli
```

Using npm:

```sh-session
$ npm install --save-dev @percy/cli
```

### Migrating Config

If you have a previous Percy configuration file, migrate it to the newest version with the
[`config:migrate`](https://github.com/percy/cli/tree/master/packages/cli-config#percy-configmigrate-filepath-output) command:

```sh-session
$ percy config:migrate
```
