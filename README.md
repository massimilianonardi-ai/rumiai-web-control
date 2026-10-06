# RumiAI Web Control

`rumiai-web-control` is the first-party deterministic Web observation/control runtime for the `m` layer. The canonical architectural contract is maintained in `rumiai-dev/specifications/rumiai-os/WEB-CONTROL.md`; this repository contains the independently versioned implementation.

The first provider uses Node.js, Playwright and a Chromium-class browser. Playwright/CDP/Chromium are implementation details and are not the provider-independent `web-control` contract.

## Runtime shape

Two package commands are produced:

```text
web-control
    deterministic client command

web-control-service
    foreground controller used by the web-control service facility
```

The normal installed lifecycle is:

```text
srv start web-control
web-control status
...
srv stop web-control
```

The package launcher supplies an isolated package HOME. `web-control-service` stores its default persistent browser profile below that HOME and keeps its local Unix-domain control socket below the same isolated application home. The socket is mode `0600` and raw browser debugger ports are not published.

The ordinary browser mode is visible (`headless=false`). `WEB_CONTROL_HEADLESS=1` exists for automated validation and non-graphical environments.

The released package depends on provider-independent runtime facilities:

```text
nodejs =26
chromium =1
```

The `chromium` facility supplies the browser executable. The release artifact contains the pinned Playwright JavaScript runtime but does not embed or download a browser.

## Public command baseline

```text
web-control status
web-control page list
web-control page new
web-control page close <page>
web-control page navigate <page> <url>
web-control page inspect <page> <summary|html|text|storage>
web-control page capture <page> <output-dir> [html|text|screenshot|mhtml]...
web-control page click <page> <target>
web-control page fill <page> <target> <value>
web-control page press <page> <target> <key>
web-control debug cdp <page> <method> [params-json]
```

Page identifiers are opaque runtime identities. The current `target` representation is a Playwright locator/CSS-compatible selector used by this first provider; it is not promoted as the provider-independent selector contract.

`mhtml` and `debug cdp` are provider-specific extensions. The portable capture baseline remains rendered HTML, readable text and screenshot.

## Development lifecycle

The project is managed by `mk`. The current `mk` runtime itself requires the managed Node.js package default and executes the project lifecycle with that Node.js environment.

After JavaScript dependencies are present and a Chromium executable is available through `PATH` or `WEB_CONTROL_BROWSER_EXECUTABLE`:

```text
mk check
mk test
mk build
```

For direct non-`m` development:

```text
npm install
WEB_CONTROL_BROWSER_EXECUTABLE=/path/to/chromium npm test
npm run build
```

`mk build` emits the platform-independent artifact `dist/rumiai-web-control-v<version>-all.tar.gz`. The artifact contains `node_modules` and therefore performs no `npm install` at runtime. Browser acquisition remains owned by the `chromium` package/facility.
