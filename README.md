# @percy/protractor

[![Version](https://img.shields.io/npm/v/@percy/protractor.svg)](https://www.npmjs.com/package/@percy/protractor)
![Test](https://github.com/percy/percy-protractor/workflows/Test/badge.svg)

[Percy](https://percy.io) visual testing for [Protractor](https://www.protractortest.org/).

## Installation

```sh-session
$ npm install --save-dev @percy/cli @percy/protractor
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
`percySnapshot(browser, name[, options])` (standalone mode only)

- `browser` (**required**) - The Protractor browser object
- `name` (**required**) - The snapshot name; must be unique to each snapshot
- `options` - [See per-snapshot configuration options](https://www.browserstack.com/docs/percy/take-percy-snapshots/overview#per-snapshot-configuration)

## Upgrading

### Automatically with `@percy/migrate`

We built a tool to help automate migrating to the new CLI toolchain! Migrating
can be done by running the following commands and following the prompts:

``` shell
$ npx @percy/migrate
? Are you currently using @percy/protractor? Yes
? Install @percy/cli (required to run percy)? Yes
? Migrate Percy config file? Yes
? Upgrade SDK to @percy/protractor@2.0.0? Yes
```

This will automatically run the changes described below for you.

### Manually

### Import change

If you're coming from a pre-2.0 version of this package, the `percySnapshot` function is now the default
export.

```javascript
// before
const { percySnapshot } = require('@percy/protractor');

// after
const percySnapshot = require('@percy/protractor');
```

### Migrating Config

If you have a previous Percy configuration file, migrate it to the newest version with the
[`config:migrate`](https://github.com/percy/cli/tree/master/packages/cli-config#percy-configmigrate-filepath-output) command:

```sh-session
$ percy config:migrate
```
